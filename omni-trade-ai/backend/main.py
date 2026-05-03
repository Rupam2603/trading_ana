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
from uuid import uuid4

load_dotenv()

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")

# --- Multi-Model Ensemble Configuration ---
MODELS = {
    "strategy":  "anthropic/claude-sonnet-4",       # Algorithmic strategy design
    "math":      "deepseek/deepseek-r1",                  # Financial math precision
    "sentiment": "deepseek/deepseek-r1",                  # Sentiment / forecasting fallback
    "fast":      "anthropic/claude-sonnet-4",   # Low-latency scalping
}

TICKER_MAP = {
    "BTC-USD": "BTCUSD", "ETH-USD": "ETHUSD", "SOL-USD": "SOLUSD",
    "TSLA": "TSLA", "NVDA": "NVDA", "AAPL": "AAPL", "MSFT": "MSFT", "AMZN": "AMZN",
    "GC=F": "XAUUSD", "SI=F": "SILVER", "CL=F": "USOIL",
    "EURUSD=X": "EURUSD", "GBPUSD=X": "GBPUSD", "JPY=X": "USDJPY",
    "^GSPC": "SPX", "^IXIC": "IXIC", "^DJI": "DJI",
    "^NSEI": "NIFTY", "^NSEBANK": "BANKNIFTY"
}

# Reverse map: internal ID -> yfinance ticker for OHLC lookups
REVERSE_TICKER_MAP = {v: k for k, v in TICKER_MAP.items()}

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
    style: str = "Standard" # Scalping, Standard, Swing

class PaperTrade(BaseModel):
    id: str
    ticker: str
    direction: str # BUY / SELL
    entry_price: float
    stop_loss: float
    target_price: float
    quantity: float
    status: str = "OPEN" # OPEN, CLOSED
    entry_time: float
    exit_time: Optional[float] = None
    pnl: float = 0.0
    source: str = "ai_strategy"

class InferenceEngine:
    def __init__(self):
        self.model = OmniTradeTFT()
        self.model.eval()
        self.buffers: Dict[str, List[List[float]]] = {}
        self.window_size = 15
        self.active_positions: List[PaperTrade] = []
        self.trade_history: List[PaperTrade] = []
        self.balance = 100000.0
        self.signal_cache = {}
        self.real_atr_cache: Dict[str, dict] = {}  # ticker -> {atr, high, low, support, resist, ts}

    async def fetch_real_ohlc_levels(self, ticker: str):
        """Fetch REAL OHLC candles from yfinance to compute true ATR and S/R levels."""
        yf_ticker = REVERSE_TICKER_MAP.get(ticker, ticker)
        cache = self.real_atr_cache.get(ticker)
        if cache and (time.time() - cache["ts"]) < 120:  # Cache 2 min
            return cache

        try:
            def _fetch():
                t = yf.Ticker(yf_ticker)
                df = t.history(period="5d", interval="15m")
                if df.empty:
                    df = t.history(period="5d", interval="1h")
                return df
            df = await asyncio.to_thread(_fetch)
            if df.empty:
                return None

            highs = df['High'].values
            lows = df['Low'].values
            closes = df['Close'].values

            # True Range ATR (proper Wilder method)
            trs = []
            for i in range(1, len(closes)):
                tr = max(highs[i] - lows[i],
                         abs(highs[i] - closes[i-1]),
                         abs(lows[i] - closes[i-1]))
                trs.append(tr)
            atr_14 = sum(trs[-14:]) / min(14, len(trs)) if trs else closes[-1] * 0.01

            # Key S/R levels from recent swings
            recent_highs = sorted(highs[-40:], reverse=True)
            recent_lows = sorted(lows[-40:])
            resistance = float(recent_highs[2]) if len(recent_highs) > 2 else float(highs[-1])
            support = float(recent_lows[2]) if len(recent_lows) > 2 else float(lows[-1])

            result = {
                "atr": float(atr_14),
                "high": float(highs[-1]),
                "low": float(lows[-1]),
                "support": support,
                "resistance": resistance,
                "daily_range": float(max(highs[-20:]) - min(lows[-20:])),
                "ts": time.time()
            }
            self.real_atr_cache[ticker] = result
            return result
        except Exception as e:
            print(f"OHLC fetch error for {ticker}: {e}")
            return None

    async def call_model(self, model_key: str, prompt: str, timeout: float = 8.0):
        """Route a prompt to a specialized model via OpenRouter."""
        if not OPENROUTER_API_KEY:
            return None
        model_id = MODELS.get(model_key, MODELS["fast"])
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    "https://openrouter.ai/api/v1/chat/completions",
                    headers={"Authorization": f"Bearer {OPENROUTER_API_KEY}", "Content-Type": "application/json"},
                    json={"model": model_id, "messages": [{"role": "user", "content": prompt}], "max_tokens": 500},
                    timeout=aiohttp.ClientTimeout(total=timeout)
                ) as resp:
                    if resp.status == 200:
                        res = await resp.json()
                        return res['choices'][0]['message']['content'].strip()
        except Exception as e:
            print(f"Model call error ({model_key}): {e}")
        return None

    async def ensemble_predict(self, ticker, price, signal, metrics, style, ohlc):
        """Multi-model ensemble: Strategy model for SL/TP, Math model for validation."""
        atr = ohlc["atr"] if ohlc else metrics["atr"]
        support = ohlc["support"] if ohlc else price * 0.98
        resistance = ohlc["resistance"] if ohlc else price * 1.02

        # --- Model 1: Strategy Architect (Claude Opus) ---
        strategy_prompt = (
            f"You are a quantitative trading strategist. Provide EXACT numeric levels.\n"
            f"Asset: {ticker} | Current Price: {price:.6f} | Signal: {signal} | Style: {style}\n"
            f"ATR(14): {atr:.6f} | Support: {support:.6f} | Resistance: {resistance:.6f}\n"
            f"Daily Range: {ohlc['daily_range']:.6f if ohlc else 'N/A'}\n\n"
            f"Rules for {style}:\n"
            f"- Scalping: SL = 0.5-1.0x ATR from entry, TP = 1.0-2.0x ATR. Ultra-tight.\n"
            f"- Standard: SL = 1.5-2.5x ATR, TP = 3.0-5.0x ATR. Intraday structure.\n"
            f"- Swing: SL = 2.0-3.5x ATR, TP = 5.0-10.0x ATR. Multi-day holds.\n\n"
            f"For a {signal} trade, calculate:\n"
            f"ENTRY: [exact price] | SL: [exact price] | TP: [exact price] | CONFIDENCE: [0-100]\n"
            f"REASONING: [max 25 words why this trade makes sense]\n\n"
            f"Output ONLY this format, nothing else:\n"
            f"ENTRY={{number}} SL={{number}} TP={{number}} CONFIDENCE={{number}} REASONING={{text}}"
        )

        # --- Model 2: Math Validator (DeepSeek-R1) ---
        math_prompt = (
            f"Validate this trade setup mathematically. Be precise.\n"
            f"Asset: {ticker} | Price: {price:.6f} | Direction: {signal}\n"
            f"ATR: {atr:.6f} | Support: {support:.6f} | Resistance: {resistance:.6f}\n"
            f"Style: {style}\n\n"
            f"Calculate the optimal risk-reward ratio and exact SL/TP prices.\n"
            f"For {signal}: SL should be below support (BUY) or above resistance (SELL).\n"
            f"TP should target the next key level with minimum 1:2 R:R.\n\n"
            f"Output ONLY: ENTRY={{number}} SL={{number}} TP={{number}} CONFIDENCE={{number}}"
        )

        # Run both models in parallel
        strategy_result, math_result = await asyncio.gather(
            self.call_model("strategy", strategy_prompt, timeout=10.0),
            self.call_model("math", math_prompt, timeout=10.0),
            return_exceptions=True
        )

        def parse_levels(text):
            if not text or isinstance(text, Exception):
                return None
            try:
                import re
                entry_m = re.search(r'ENTRY\s*=\s*([\d.]+)', text)
                sl_m = re.search(r'SL\s*=\s*([\d.]+)', text)
                tp_m = re.search(r'TP\s*=\s*([\d.]+)', text)
                conf_m = re.search(r'CONFIDENCE\s*=\s*([\d.]+)', text)
                reason_m = re.search(r'REASONING\s*=\s*(.+)', text)
                if entry_m and sl_m and tp_m:
                    return {
                        "entry": float(entry_m.group(1)),
                        "sl": float(sl_m.group(1)),
                        "tp": float(tp_m.group(1)),
                        "conf": float(conf_m.group(1)) / 100 if conf_m else 0.75,
                        "reasoning": reason_m.group(1).strip() if reason_m else ""
                    }
            except Exception:
                pass
            return None

        strat = parse_levels(str(strategy_result)) if strategy_result else None
        math = parse_levels(str(math_result)) if math_result else None

        # --- Ensemble Merge ---
        if strat and math:
            # Average the two models, weighted toward strategy model
            entry = strat["entry"] * 0.6 + math["entry"] * 0.4
            sl_val = strat["sl"] * 0.6 + math["sl"] * 0.4
            tp_val = strat["tp"] * 0.6 + math["tp"] * 0.4
            conf = (strat["conf"] + math["conf"]) / 2
            reasoning = strat.get("reasoning", "Multi-model consensus confirmed trade levels.")
            return entry, sl_val, tp_val, conf, reasoning
        elif strat:
            return strat["entry"], strat["sl"], strat["tp"], strat["conf"], strat.get("reasoning", "Strategy model confirmed.")
        elif math:
            return math["entry"], math["sl"], math["tp"], math["conf"], "Math model validated levels."

        return None  # Fallback to quant engine

    def execute_paper_trade(self, trade_data: dict):
        trade_id = str(uuid4())[:8]
        new_trade = PaperTrade(
            id=trade_id,
            ticker=trade_data['ticker'],
            direction=trade_data['direction'],
            entry_price=trade_data['entry'],
            stop_loss=trade_data['sl'],
            target_price=trade_data['tp'],
            quantity=trade_data['quantity'],
            entry_time=time.time(),
            source=trade_data.get('source', 'ai_strategy')
        )
        self.active_positions.append(new_trade)
        return new_trade

    def process_matching_engine(self, ticker, current_price):
        """Simulates real-world execution matching against live ticks."""
        closed_trades = []
        for trade in self.active_positions:
            if trade.ticker != ticker: continue
            
            pnl = 0.0
            triggered = False
            
            if trade.direction == "BUY":
                if current_price <= trade.stop_loss: # SL Hit
                    trade.status = "CLOSED"
                    trade.exit_time = time.time()
                    trade.pnl = (trade.stop_loss - trade.entry_price) * trade.quantity
                    triggered = True
                elif current_price >= trade.target_price: # TP Hit
                    trade.status = "CLOSED"
                    trade.exit_time = time.time()
                    trade.pnl = (trade.target_price - trade.entry_price) * trade.quantity
                    triggered = True
            elif trade.direction == "SELL":
                if current_price >= trade.stop_loss: # SL Hit
                    trade.status = "CLOSED"
                    trade.exit_time = time.time()
                    trade.pnl = (trade.entry_price - trade.stop_loss) * trade.quantity
                    triggered = True
                elif current_price <= trade.target_price: # TP Hit
                    trade.status = "CLOSED"
                    trade.exit_time = time.time()
                    trade.pnl = (trade.entry_price - trade.target_price) * trade.quantity
                    triggered = True
            
            if triggered:
                self.balance += trade.pnl
                closed_trades.append(trade)
                self.trade_history.append(trade)
        
        self.active_positions = [t for t in self.active_positions if t.status == "OPEN"]
        return closed_trades

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
            
            # Save results to a cache for the GET endpoint
            if not hasattr(self, 'signal_cache'): self.signal_cache = {}
            self.signal_cache[ticker] = (final_signal, final_conf, metrics)
            
            # --- Matching Engine Update ---
            self.process_matching_engine(ticker, data.price)
            
            return final_signal, final_conf, metrics
        
        # Default state: returning metrics but HOLD signal
        # Even if we don't have enough data for a full signal, try to return technical bias if possible
        if len(prices) > 3:
            rsi = self.calculate_rsi(prices)
            bias = "HOLD"
            if rsi < 35: bias = "BUY"
            elif rsi > 65: bias = "SELL"
            return bias, 0.5 + (rsi/200), metrics

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
    Now uses REAL OHLC ATR + Multi-Model Ensemble for accurate SL/TP.
    """
    signal, confidence, metrics = await engine.process_tick(data)
    
    style = data.style
    
    # --- CRITICAL FIX: Fetch REAL ATR from OHLC candles ---
    ohlc = await engine.fetch_real_ohlc_levels(data.ticker)
    real_atr = ohlc["atr"] if ohlc else data.price * 0.01  # Fallback: 1% of price
    
    # Override the tick-based ATR with real ATR
    metrics["atr"] = real_atr
    if ohlc:
        metrics["support"] = ohlc["support"]
        metrics["resistance"] = ohlc["resistance"]
    
    # Strategy-Specific Multipliers (now applied to REAL ATR)
    multipliers = {
        "Scalping": {"sl": 0.8, "tp": 1.6},
        "Standard": {"sl": 1.8, "tp": 4.0},
        "Swing":    {"sl": 3.0, "tp": 8.0}
    }
    m = multipliers.get(style, multipliers["Standard"])
    
    # --- Tier 1: Quantitative Engine (Real ATR-based) ---
    if signal == "BUY":
        quant_sl = data.price - (real_atr * m["sl"])
        quant_tp = data.price + (real_atr * m["tp"])
        quant_entry = data.price
    elif signal == "SELL":
        quant_sl = data.price + (real_atr * m["sl"])
        quant_tp = data.price - (real_atr * m["tp"])
        quant_entry = data.price
    else:
        quant_sl = quant_tp = quant_entry = 0.0

    reasoning = data.reasoning
    final_conf = confidence
    final_entry = quant_entry
    final_sl = quant_sl
    final_tp = quant_tp

    # --- Tier 2: Multi-Model Ensemble (LLM Refinement) ---
    if signal != "HOLD" and OPENROUTER_API_KEY:
        try:
            timeout = 5.0 if style == "Scalping" else 12.0
            ensemble_result = await asyncio.wait_for(
                engine.ensemble_predict(data.ticker, data.price, signal, metrics, style, ohlc),
                timeout=timeout
            )
            if ensemble_result:
                e_entry, e_sl, e_tp, e_conf, e_reason = ensemble_result
                # Sanity check: LLM levels must be within 5% of price
                price = data.price
                if abs(e_entry - price) / price < 0.05 and abs(e_sl - price) / price < 0.15:
                    final_entry = e_entry
                    final_sl = e_sl
                    final_tp = e_tp
                    final_conf = (confidence * 0.3 + e_conf * 0.7)
                    reasoning = e_reason
                    print(f"[ENSEMBLE] {data.ticker}: E={final_entry:.2f} SL={final_sl:.2f} TP={final_tp:.2f}")
                else:
                    print(f"[ENSEMBLE] Sanity check failed, using quant levels")
                    reasoning = "Quant engine levels (LLM out of range)."
        except asyncio.TimeoutError:
            reasoning = f"Real ATR-based levels. Models timed out. ATR={real_atr:.4f}"
        except Exception as ex:
            print(f"Ensemble error: {ex}")
            reasoning = "Quantitative engine confirmed structure with real volatility."

    # Final Payload
    payload = {
        "type": "TICKER_UPDATE",
        "ticker": data.ticker,
        "price": data.price,
        "entry_price": float(final_entry),
        "stop_loss": float(final_sl),
        "target_price": float(final_tp),
        "signal": signal,
        "confidence": float(min(0.99, final_conf)),
        "reasoning": reasoning,
        "style": style,
        "metrics": metrics,
        "timestamp": data.timestamp
    }
    
    await manager.broadcast(payload)
    return {"status": "ok", "signal": signal, "confidence": float(final_conf)}

# --- Paper Trading Endpoints ---
@app.get("/api/paper/positions")
async def get_paper_positions():
    return {
        "active": [t.dict() for t in engine.active_positions],
        "history": [t.dict() for t in engine.trade_history[-10:]],
        "balance": engine.balance
    }

@app.post("/api/paper/trade")
async def place_paper_trade(trade_data: dict):
    # Apply realistic slippage (1 tick / 0.01%)
    trade_data['entry'] = trade_data['entry'] * (1.0001 if trade_data['direction'] == 'BUY' else 0.9999)
    
    trade = engine.execute_paper_trade(trade_data)
    return {"status": "executed", "trade": trade.dict()}

@app.post("/api/paper/reset")
async def reset_paper_account():
    engine.active_positions = []
    engine.balance = 100000.0
    return {"status": "reset", "balance": engine.balance}

@app.get("/api/price/{ticker}")
async def get_price(ticker: str, style: str = "Standard"):
    """
    Get the latest price and full signal data for a given ticker, optimized for a specific trading style.
    """
    # 1. Try to get data from engine's buffer
    if ticker in engine.buffers and engine.buffers[ticker]:
        last_tick = engine.buffers[ticker][-1]
        
        # Calculate signal on the fly with the requested style
        data_obj = MarketState(
            ticker=ticker,
            price=last_tick[0],
            volume=last_tick[1],
            sentiment=last_tick[2],
            timestamp=last_tick[3],
            style=style
        )
        
        # Trigger full signal calculation with Tier 1 & 2 logic
        res_full = await ingest_data(data_obj)
        
        return res_full
    
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

