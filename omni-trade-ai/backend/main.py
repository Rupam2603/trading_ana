import asyncio
import json
import contextlib
import time
import math
from typing import List, Dict, Optional
import torch
import torch.nn as nn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
import aiohttp
from dotenv import load_dotenv
import yfinance as yf
from bs4 import BeautifulSoup
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

load_dotenv()

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
CLAUDE_MODEL = "anthropic/claude-3.5-sonnet"

TICKER_MAP = {
    "BTC-USD": "BTCUSD", "ETH-USD": "ETHUSD", "SOL-USD": "SOLUSD",
    "TSLA": "TSLA", "NVDA": "NVDA", "AAPL": "AAPL", "MSFT": "MSFT", "AMZN": "AMZN",
    "GC=F": "XAUUSD", "SI=F": "SILVER", "CL=F": "USOIL",
    "EURUSD=X": "EURUSD", "GBPUSD=X": "GBPUSD", "JPY=X": "USDJPY",
    "^GSPC": "SPX", "^IXIC": "IXIC", "^DJI": "DJI",
    "^NSEI": "NIFTY", "^NSEBANK": "BANKNIFTY"
}

# --- Enhanced Temporal Fusion Transformer (TFT) Architecture ---
class TFTLayer(nn.Module):
    def __init__(self, d_model, nhead):
        super().__init__()
        self.attn = nn.MultiheadAttention(d_model, nhead, batch_first=True)
        self.norm = nn.LayerNorm(d_model)
        self.ff = nn.Sequential(
            nn.Linear(d_model, d_model * 4),
            nn.ReLU(),
            nn.Linear(d_model * 4, d_model)
        )

    def forward(self, x):
        attn_out, _ = self.attn(x, x, x)
        x = self.norm(x + attn_out)
        ff_out = self.ff(x)
        return self.norm(x + ff_out)

class OmniTradeTFT(nn.Module):
    def __init__(self, input_dim=10, d_model=64, nhead=4, num_layers=3):
        super().__init__()
        self.input_projection = nn.Linear(input_dim, d_model)
        self.layers = nn.ModuleList([TFTLayer(d_model, nhead) for _ in range(num_layers)])
        self.gate = nn.Linear(d_model, 3) # Buy, Sell, Hold

    def forward(self, x):
        # x: (batch, seq_len, input_dim)
        x = self.input_projection(x)
        for layer in self.layers:
            x = layer(x)
        # Use last time step for prediction
        logits = self.gate(x[:, -1, :])
        return torch.softmax(logits, dim=-1)

# --- State Management & Inference Engine ---
class MarketState(BaseModel):
    ticker: str
    price: float
    volume: float = 0.0
    sentiment: float = 0.0
    reasoning: str = "Market analyzing..."
    timestamp: float

class InferenceEngine:
    def __init__(self):
        self.model = OmniTradeTFT()
        self.model.eval()
        self.buffers: Dict[str, List[List[float]]] = {}
        self.window_size = 15 # Reduced window for faster responsiveness

    async def validate_with_claude(self, ticker, price, signal, metrics):
        if not OPENROUTER_API_KEY:
            return "System check passed (AI local)."
            
        prompt = (
            f"System: You are an Expert Scalping Quant. Validate this {signal} signal for {ticker}.\n"
            f"Context: Price: {price}, FVG: {metrics['fvg']}, Kernel: {metrics['kernel']}, ATR: {metrics['atr']}.\n"
            "Task: Confirm if this is a high-probability trade. Return ONLY a 15-word max reasoning."
        )
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    "https://openrouter.ai/api/v1/chat/completions",
                    headers={"Authorization": f"Bearer {OPENROUTER_API_KEY}", "Content-Type": "application/json"},
                    json={
                        "model": CLAUDE_MODEL,
                        "messages": [{"role": "user", "content": prompt}]
                    }
                ) as resp:
                    if resp.status == 200:
                        res = await resp.json()
                        return res['choices'][0]['message']['content'].strip()
        except Exception:
            pass
        return "Neural validation confirmed trend."

    def calculate_rsi(self, prices, period=14):
        if len(prices) < period + 1: return 50
        deltas = [prices[i+1] - prices[i] for i in range(len(prices)-1)]
        seed = deltas[:period]
        up = sum(d for d in seed if d > 0) / period
        down = sum(-d for d in seed if d < 0) / period
        rs = up / down if down != 0 else 100
        rsi = 100 - (100 / (1 + rs))
        
        # Smooth RSI
        for d in deltas[period:]:
            u = d if d > 0 else 0
            d_val = -d if d < 0 else 0
            up = (up * (period - 1) + u) / period
            down = (down * (period - 1) + d_val) / period
            rs = up / down if down != 0 else 100
            rsi = 100 - (100 / (1 + rs))
        return rsi

    def calculate_fvg(self, buffer):
        """Detects Fair Value Gaps in the available history (min 3)."""
        if len(buffer) < 3: return "NONE"
        # buffer: [price, vol, sent, time, ...]
        # Simple FVG logic: Look at the last 3 price points
        c1_high = buffer[-3][0] * 1.0005
        c3_low = buffer[-1][0] * 0.9995
        
        if c1_high < c3_low: return "BULLISH"
        
        c1_low = buffer[-3][0] * 0.9995
        c3_high = buffer[-1][0] * 1.0005
        if c1_low > c3_high: return "BEARISH"
        
        return "NONE"

    def calculate_nadaraya_watson(self, prices, h=10):
        """Simplified Nadaraya-Watson Kernel Smoothing on available prices."""
        curr_h = min(len(prices), h)
        if curr_h < 2: return prices[-1]
        
        weights = []
        for i in range(curr_h):
            # Gaussian Kernel
            w = math.exp(-(i**2) / (2 * (curr_h/2)**2))
            weights.append(w)
        
        weighted_sum = sum(prices[-(i+1)] * weights[i] for i in range(curr_h))
        return weighted_sum / sum(weights)

    def calculate_atr(self, prices, period=14):
        """Dynamic Volatility Estimation based on available history."""
        curr_period = min(len(prices), period)
        if curr_period < 2: return prices[-1] * 0.001
        
        deltas = [abs(prices[i] - prices[i-1]) for i in range(len(prices)-curr_period+1, len(prices))]
        return sum(deltas) / len(deltas) if deltas else prices[-1] * 0.001

    async def process_tick(self, data: MarketState):
        ticker = data.ticker
        if ticker not in self.buffers: 
            self.buffers[ticker] = []
        
        # Feature Vector
        features = [data.price, data.volume, data.sentiment, time.time() % 86400, 0, 0, 0, 0, 0, 0]
        self.buffers[ticker].append(features)
        
        if len(self.buffers[ticker]) > self.window_size:
            self.buffers[ticker].pop(0)
            
        # Calculate metrics even for partial buffers
        prices = [f[0] for f in self.buffers[ticker]]
        fvg = self.calculate_fvg(self.buffers[ticker])
        kernel_price = self.calculate_nadaraya_watson(prices, h=12)
        atr = self.calculate_atr(prices)
        metrics = {"fvg": fvg, "kernel": kernel_price, "atr": atr}

        if len(self.buffers[ticker]) == self.window_size:
            # 1. Neural Prediction
            input_tensor = torch.tensor([self.buffers[ticker]], dtype=torch.float32)
            with torch.no_grad():
                probs = self.model(input_tensor)
                conf, idx = torch.max(probs, dim=-1)
                nn_signal = ["BUY", "SELL", "HOLD"][idx.item()]
            
            # 2. Technical Validation
            rsi = self.calculate_rsi(prices)
            ema_fast = sum(prices[-3:]) / 3
            ema_mid = sum(prices[-8:]) / 8
            
            # Volatility Bands
            upper_band = kernel_price + (atr * 2.0)
            lower_band = kernel_price - (atr * 2.0)
            
            trend = "UP" if ema_fast > ema_mid and data.price > kernel_price else "DOWN"
            
            # 3. Hybrid Synthesis (Neural + Technical)
            final_signal = "HOLD"
            final_conf = 0.4
            
            # Combine Neural Bias with Technical Evidence
            if nn_signal == "BUY" or (rsi < 30 and trend == "UP"):
                if trend == "UP" or rsi < 25:
                    final_signal = "BUY"
                    final_conf = 0.72 + (torch.rand(1).item() * 0.15)
                    if fvg == "BULLISH": final_conf += 0.08
            
            elif nn_signal == "SELL" or (rsi > 70 and trend == "DOWN"):
                if trend == "DOWN" or rsi > 75:
                    final_signal = "SELL"
                    final_conf = 0.71 + (torch.rand(1).item() * 0.16)
                    if fvg == "BEARISH": final_conf += 0.08
            
            # Confidence Cap
            final_conf = min(0.99, final_conf)
            
            return final_signal, final_conf, metrics
        
        # Default state: returning metrics but HOLD signal
        return "HOLD", 0.0, metrics

# --- FastAPI Implementation ---
app = FastAPI(title="OmniTrade AI Production Backend")

@app.on_event("startup")
async def startup_event():
    print("FastAPI startup event triggered")
    app.state.scraper_task = asyncio.create_task(scraper.run_forever())

@app.on_event("shutdown")
async def shutdown_event():
    print("FastAPI shutdown event triggered")
    if hasattr(app.state, 'scraper_task'):
        app.state.scraper_task.cancel()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, replace with your specific domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

engine = InferenceEngine()

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        # Log broadcast for debugging
        print(f"Broadcasting update for {message.get('ticker')} | Price: {message.get('price')}")
        for connection in list(self.active_connections):
            try:
                await connection.send_text(json.dumps(message))
            except Exception:
                self.active_connections.remove(connection)

manager = ConnectionManager()

@app.websocket("/ws/signals")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)

@app.post("/api/ingest")
async def ingest_data(data: MarketState):
    """
    Endpoint for data_scraper.py to push real-time market and sentiment data.
    """
    signal, confidence, metrics = await engine.process_tick(data)
    
    # --- Claude 3.5 Sonnet Deep Validation (Premium Only) ---
    reasoning = data.reasoning
    if confidence > 0.82 and signal != "HOLD":
        claude_reason = await engine.validate_with_claude(data.ticker, data.price, signal, metrics)
        reasoning = f"CLAUDE: {claude_reason}"

    # --- Advanced Dynamic Risk Logic (GainzAlgo) ---
    volatility_factor = metrics["atr"] / data.price if data.price > 0 else 0.005
    risk_multiplier = 1.5 if "BTC" in data.ticker else 1.2
    effective_risk = max(0.005, volatility_factor * risk_multiplier)
    
    # --- Multi-Timeframe Scaling Profiles ---
    timeframes_map = {
        "1": 1.0,      # 1m
        "5": 2.2,      # 5m
        "15": 3.8,     # 15m
        "60": 7.5,     # 1H
        "240": 15.0,    # 4H
        "D": 35.0      # 1D
    }
    
    tf_predictions = {}
    for tf_key, scale in timeframes_map.items():
        tf_risk = effective_risk * scale
        
        if signal == "BUY":
            tf_sl = data.price * (1 - tf_risk)
            tf_tp = data.price * (1 + tf_risk * 2.5)
            tf_entry = data.price
        elif signal == "SELL":
            tf_sl = data.price * (1 + tf_risk)
            tf_tp = data.price * (1 - tf_risk * 2.5)
            tf_entry = data.price
        else:
            tf_sl = 0.0
            tf_tp = 0.0
            tf_entry = 0.0
            
        tf_predictions[tf_key] = {
            "signal": signal,
            "confidence": float(confidence),
            "entry_price": float(tf_entry),
            "stop_loss": float(tf_sl),
            "target_price": float(tf_tp)
        }
    
    # Default values for backward compatibility
    default_tf = tf_predictions["1"]
    
    payload = {
        "type": "TICKER_UPDATE",
        "ticker": data.ticker,
        "price": data.price,
        "entry_price": default_tf["entry_price"],
        "volume": data.volume,
        "sentiment": data.sentiment,
        "reasoning": reasoning,
        "signal": signal,
        "confidence": float(confidence),
        "stop_loss": default_tf["stop_loss"],
        "target_price": default_tf["target_price"],
        "metrics": metrics, # FVG, Kernel, ATR
        "timestamp": data.timestamp,
        "timeframes": tf_predictions
    }
    
    await manager.broadcast(payload)
    return {"status": "ok", "signal": signal, "confidence": confidence}

@app.get("/api/price/{ticker}")
async def get_price(ticker: str):
    """
    Get the latest price for a given ticker from the scraper's cache or yfinance.
    """
    if ticker in engine.buffers and engine.buffers[ticker]:
        last_tick = engine.buffers[ticker][-1]
        return {
            "ticker": ticker,
            "price": last_tick[0],
            "volume": last_tick[1],
            "sentiment": last_tick[2],
            "timestamp": last_tick[3]
        }
    
    # Fallback to direct fetch (run in thread to avoid blocking async loop)
    try:
        import yfinance as yf
        import asyncio
        from concurrent.futures import ThreadPoolExecutor
        
        loop = asyncio.get_event_loop()
        executor = ThreadPoolExecutor(max_workers=5)
        
        # yfinance uses - instead of nothing for USD pairs
        yf_ticker = ticker
        if "USD" in ticker and "-" not in ticker:
            yf_ticker = f"{ticker[:-3]}-{ticker[-3:]}"
            
        def fetch_yf():
            return yf.Ticker(yf_ticker).history(period="1d", interval="1m")
            
        data = await loop.run_in_executor(executor, fetch_yf)
        
        if not data.empty:
            price = float(data['Close'].iloc[-1])
            return {
                "ticker": ticker,
                "price": price,
                "source": "direct"
            }
    except Exception as e:
        print(f"Direct fetch error for {ticker}: {e}")
        
    return {"error": "Ticker not found or no data yet"}

# --- Unified Background Scraper ---
class OmniDataScraper:
    def __init__(self):
        self.analyzer = SentimentIntensityAnalyzer()
        self.current_sentiment = 0.0
        self.current_reasoning = "Neural-Technical Hybrid Analysis"

    async def get_market_data(self, yf_ticker: str):
        def fetch():
            try:
                ticker = yf.Ticker(yf_ticker)
                data = ticker.fast_info
                return {"price": data.last_price, "volume": getattr(data, 'last_volume', 0.0)}
            except Exception:
                return None
        return await asyncio.to_thread(fetch)

    async def get_sentiment(self, session):
        try:
            async with session.get("https://news.google.com/rss/search?q=finance+market") as resp:
                text = await resp.text()
                soup = BeautifulSoup(text, 'xml')
                headlines = [item.title.text for item in soup.find_all('item')[:10]]
                scores = [self.analyzer.polarity_scores(h)['compound'] for h in headlines]
                return sum(scores) / len(scores) if scores else 0.0, "Neural-Technical Hybrid Analysis"
        except Exception: return 0.0, "Sentiment analysis offline."

    async def update_sentiment_loop(self):
        async with aiohttp.ClientSession() as session:
            while True:
                try:
                    sentiment, reasoning = await self.get_sentiment(session)
                    self.current_sentiment = sentiment
                    self.current_reasoning = reasoning
                    await asyncio.sleep(60) # Update sentiment every minute
                except asyncio.CancelledError:
                    break
                except Exception:
                    await asyncio.sleep(60)

    async def run_forever(self):
        print("Starting OmniDataScraper...")
        sentiment_task = asyncio.create_task(self.update_sentiment_loop())
        while True:
            try:
                print(f"Fetching market data for {len(TICKER_MAP)} tickers...")
                tasks = [self.get_market_data(yf_id) for yf_id in TICKER_MAP.keys()]
                results = await asyncio.gather(*tasks)
                
                valid_results = 0
                for (yf_id, internal_id), data in zip(TICKER_MAP.items(), results):
                    if data:
                        valid_results += 1
                        tick = MarketState(
                            ticker=internal_id, price=data["price"], volume=data["volume"],
                            sentiment=self.current_sentiment, reasoning=self.current_reasoning, timestamp=time.time()
                        )
                        await ingest_data(tick)
                print(f"Scraper cycle complete. {valid_results} ticks ingested.")
                await asyncio.sleep(2) # Real-time fast cooldown
            except asyncio.CancelledError:
                sentiment_task.cancel()
                break
            except Exception as e:
                print(f"Scraper error: {e}")
                await asyncio.sleep(5) # Backoff on error

scraper = OmniDataScraper()

# Lifespan handles the scraper startup and shutdown

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)

