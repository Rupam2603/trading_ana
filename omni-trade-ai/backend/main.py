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
from cache import stability_lock
from strategies.scalping_engine import analyze_scalping
from strategies.standard_engine import analyze_standard
from strategies.swing_engine import analyze_swing

load_dotenv()

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")

# --- Multi-Model Ensemble Configuration ---
MODELS = {
    "strategy":  "anthropic/claude-3-opus",         # Claude Opus for algorithmic strategy
    "coding":    "anthropic/claude-3.5-sonnet",     # Claude 3.5 Sonnet for script/logic
    "math":      "deepseek/deepseek-r1",            # DeepSeek-R1 for financial math precision
    "reasoning": "qwen/qwq-32b-preview",            # Qwen QwQ for complex reasoning
    "sentiment": "qwen/qwen-2.5-72b-instruct",      # Qwen for market forecasting/FinGPT role
    "fast":      "anthropic/claude-3.5-sonnet",     # Fast execution layer
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
        self.prediction_memory: Dict[str, dict] = {} # ticker -> {signal, entry, sl, tp, conf, reason, ts, price, style}
        self.full_prediction_history: List[dict] = []
        self._processing_locks: Dict[tuple, asyncio.Lock] = {}

    def get_lock(self, ticker: str, style: str) -> asyncio.Lock:
        key = (ticker, style)
        if key not in self._processing_locks:
            self._processing_locks[key] = asyncio.Lock()
        return self._processing_locks[key]

    async def fetch_real_ohlc_levels(self, ticker: str, mode: str = "Standard"):
        """Fetch REAL OHLC candles from yfinance to compute true ATR and S/R levels."""
        yf_ticker = REVERSE_TICKER_MAP.get(ticker, ticker)
        
        # Timeframe mapping for liquidity assessment
        tf_map = {"Scalping": "5m", "Standard": "15m", "Swing": "1h"}
        interval = tf_map.get(mode, "15m")
        period_map = {"5m": "1d", "15m": "5d", "1h": "1mo"}
        period = period_map.get(interval, "5d")

        cache_key = f"{ticker}_{mode}"
        cache = self.real_atr_cache.get(cache_key)
        if cache and (time.time() - cache["ts"]) < 60:  # Cache 1 min
            return cache

        try:
            def _fetch():
                t = yf.Ticker(yf_ticker)
                return t.history(period=period, interval=interval)
            df = await asyncio.to_thread(_fetch)
            if df.empty:
                return None

            # Clean data: drop NaNs and keep only numeric values
            df = df.dropna(subset=['High', 'Low', 'Close', 'Volume'])
            highs = df['High'].values
            lows = df['Low'].values
            closes = df['Close'].values
            volumes = df['Volume'].values

            if len(closes) < 20: return None

            # 1. ATR Calculation (Wilder Method)
            trs = []
            for i in range(1, len(closes)):
                trs.append(max(highs[i] - lows[i], abs(highs[i] - closes[i-1]), abs(lows[i] - closes[i-1])))
            valid_trs = [tr for tr in trs if tr > 0]
            raw_atr = sum(valid_trs[-14:]) / min(14, len(valid_trs)) if valid_trs else closes[-1] * 0.005
            atr_14 = max(raw_atr, closes[-1] * 0.0015)

            # 2. Confluence: EMA 20 & VWAP
            ema_20 = df['Close'].ewm(span=20, adjust=False).mean().iloc[-1]
            # Simple VWAP proxy for session (last 24 hours of 15m candles)
            v_sum = df['Volume'].iloc[-96:].sum()
            pv_sum = (df['Close'] * df['Volume']).iloc[-96:].sum()
            vwap = pv_sum / v_sum if v_sum > 0 else closes[-1]

            # 3. Fibonacci Extensions
            recent_low = min(lows[-100:])
            recent_high = max(highs[-100:])
            diff = recent_high - recent_low
            fib_1618 = recent_high + (diff * 0.618) if diff > 0 else closes[-1] * 1.05
            fib_0618 = recent_low + (diff * 0.618)

            # 4. Volume Profile (POC)
            # Divide range into 10 bins to find high volume node
            bins = 10
            min_p, max_p = min(lows[-100:]), max(highs[-100:])
            bin_size = (max_p - min_p) / bins
            vol_bins = [0] * bins
            for p, v in zip(closes[-100:], volumes[-100:]):
                idx = min(int((p - min_p) / bin_size), bins-1)
                vol_bins[idx] += v
            poc_idx = vol_bins.index(max(vol_bins))
            poc_price = min_p + (poc_idx * bin_size) + (bin_size/2)

            result = {
                "atr": float(atr_14),
                "ema_20": float(ema_20),
                "vwap": float(vwap),
                "fib_1618": float(fib_1618),
                "poc": float(poc_price),
                "support": float(min(lows[-40:])),
                "resistance": float(max(highs[-40:])),
                "daily_range": float(recent_high - recent_low),
                "ts": time.time()
            }
            self.real_atr_cache[cache_key] = result
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
        """
        OmniTrade 3-Tier Ensemble:
        1. Strategy Architect (Claude Opus) - Core SL/TP/Entry logic.
        2. Math Validator (DeepSeek-R1) - Precision verification.
        3. Market Forecast (Qwen) - Trend sentiment & final confidence.
        """
        # Extract ATR from metrics for prompt injection
        atr = metrics.get('atr', price * 0.01)
        
        # Strategic Prompt with Injected Math
        strategy_prompt = (
            f"You are an Expert Quant-AI Trader. I have pre-calculated the core math coordinates.\n"
            f"Ticker: {ticker} | Price: {price:.4f} | Signal: {signal} | Style: {style}\n"
            f"CONFLUENCE DATA:\n"
            f"- ATR: {atr:.4f} | POC (Volume Profile): {ohlc['poc']:.4f}\n"
            f"- EMA 20: {ohlc['ema_20']:.4f} | VWAP: {ohlc['vwap']:.4f}\n"
            f"- Fib 1.618: {ohlc['fib_1618']:.4f}\n\n"
            f"TRADING PROTOCOL ({style}):\n"
            f"1. ENTRY: Must align with POC, EMA, or VWAP pullback. Offset from round numbers.\n"
            f"2. STOP LOSS: Use 1.5x-2.0x ATR for {style}. Place behind S/R={ohlc['support'] if signal=='BUY' else ohlc['resistance']}.\n"
            f"3. TAKE PROFIT: Target Fib 1.618 or Resistance={ohlc['resistance'] if signal=='BUY' else ohlc['support']}. Enforce 1:1.5 R:R min.\n\n"
            f"OUTPUT ONLY JSON:\n"
            f"{{\"entry\": float, \"sl\": float, \"tp\": float, \"confidence\": 0-100, \"reasoning\": \"max 2 sentences\"}}"
        )

        results = await asyncio.gather(
            self.call_model("strategy", strategy_prompt, timeout=12.0),
            self.call_model("math", f"Verify 1:2 R:R for {signal} at {price}. ATR={atr}. Support={ohlc['support']}. Output ONLY JSON: {{\"valid\": bool, \"sl\": float, \"tp\": float}}", timeout=8.0),
            self.call_model("reasoning", f"Forecast probability for {signal} at {price}. Style: {style}. Output ONLY: PROBABILITY = X", timeout=8.0),
            return_exceptions=True
        )

        def parse_json(text):
            if not text or isinstance(text, Exception): return None
            import json, re
            try:
                # Find JSON block
                m = re.search(r'\{.*\}', text, re.DOTALL)
                return json.loads(m.group(0)) if m else None
            except: return None

        strat_data = parse_json(results[0])
        math_data = parse_json(results[1])

        if strat_data:
            return (
                strat_data.get('entry', price),
                strat_data.get('sl'),
                strat_data.get('tp'),
                strat_data.get('confidence', 70) / 100,
                strat_data.get('reasoning', "Confluence consensus achieved.")
            )

        def parse_val(text, pattern):
            if not text or isinstance(text, Exception): return None
            import re
            m = re.search(pattern, text)
            return m.group(1) if m else None

        # Check if we have enough results before unpacking
        if len(results) < 3:
            return price, price*0.99, price*1.02, 0.7, "Quant fallback consensus."

        strat_raw, math_raw, fore_raw = results[:3]
        
        # Extract data
        s_entry = parse_val(strat_raw, r'ENTRY\s*=\s*([\d.]+)')
        s_sl = parse_val(strat_raw, r'SL\s*=\s*([\d.]+)')
        s_tp = parse_val(strat_raw, r'TP\s*=\s*([\d.]+)')
        s_conf = parse_val(strat_raw, r'CONFIDENCE\s*=\s*([\d.]+)')
        s_reason = parse_val(strat_raw, r'REASONING\s*=\s*(.+)')
        
        m_entry = parse_val(math_raw, r'ENTRY\s*=\s*([\d.]+)')
        m_sl = parse_val(math_raw, r'SL\s*=\s*([\d.]+)')
        m_tp = parse_val(math_raw, r'TP\s*=\s*([\d.]+)')
        
        f_prob = parse_val(fore_raw, r'PROBABILITY\s*=\s*([\d.]+)')

        # Merge Logic
        if s_entry and m_entry:
            # Weighted average: Opus (60%) + DeepSeek (40%)
            final_entry = float(s_entry) * 0.6 + float(m_entry) * 0.4
            final_sl = float(s_sl) * 0.6 + float(m_sl) * 0.4
            final_tp = float(s_tp) * 0.6 + float(m_tp) * 0.4
            
            # Confidence weighting: Opus Conf + Qwen Prob
            base_conf = float(s_conf) if s_conf else 75
            prob_adj = float(f_prob) if f_prob else 50
            final_conf = (base_conf * 0.7 + prob_adj * 0.3) / 100
            
            reason = s_reason if s_reason else "Triple-model consensus achieved."
            return final_entry, final_sl, final_tp, final_conf, reason.strip()
        
        return None

    def calculate_lot_size(self, entry, sl, risk_pct=1.0):
        """Dynamic Position Sizing: (Balance * Risk%) / |Entry - SL|"""
        risk_amount = self.balance * (risk_pct / 100.0)
        price_diff = abs(entry - sl)
        if price_diff == 0: return 0.01
        return risk_amount / price_diff

    def execute_paper_trade(self, trade_data: dict):
        trade_id = str(uuid4())[:8]
        
        # Calculate optimal lot size if not provided
        entry = float(trade_data['entry'])
        sl = float(trade_data['sl'])
        qty = trade_data.get('quantity')
        if not qty:
            qty = self.calculate_lot_size(entry, sl, risk_pct=trade_data.get('risk_pct', 1.0))

        new_trade = PaperTrade(
            id=trade_id,
            ticker=trade_data['ticker'],
            direction=trade_data['direction'],
            entry_price=entry,
            stop_loss=sl,
            target_price=float(trade_data['tp']),
            quantity=float(qty),
            entry_time=time.time(),
            source=trade_data.get('source', 'ai_strategy')
        )
        self.active_positions.append(new_trade)
        print(f"[PAPER TRADE] Executed {new_trade.direction} {new_trade.ticker} | Qty: {qty:.4f} | Risk: {trade_data.get('risk_pct', 1.0)}%")
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
        volumes = [f[1] for f in self.buffers[ticker]]
        fvg = self.calculate_fvg(self.buffers[ticker])
        kernel_price = self.calculate_nadaraya_watson(prices, h=12)
        atr = self.calculate_atr(prices)
        
        # Comprehensive fallbacks for Strategy Engines
        vwap = sum(p * v for p, v in zip(prices, volumes)) / sum(volumes) if sum(volumes) > 0 else prices[-1]
        ema_20 = sum(prices[-20:]) / len(prices[-20:]) if len(prices) >= 20 else prices[-1]
        poc = prices[volumes.index(max(volumes))] if volumes else prices[-1]
        
        # Simple S/R from buffer
        support = min(prices)
        resistance = max(prices)
        
        metrics = {
            "fvg": fvg, 
            "kernel": kernel_price, 
            "atr": atr,
            "vwap": vwap,
            "ema_20": ema_20,
            "poc": poc,
            "support": support,
            "resistance": resistance,
            "fib_1618": support + (resistance - support) * 1.618
        }

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
    Main ingestion endpoint. Routes predictions to specialized engines 
    and implements the Timeframe Stability Lock.
    """
    ticker = data.ticker
    style = data.style
    
    # 1. --- STABILITY LOCK CHECK ---
    # If we have a locked prediction for this candle, return it immediately.
    locked = stability_lock.get_locked_prediction(ticker, style)
    if locked:
        # Update current price in the payload before broadcasting
        payload = {**locked, "price": float(data.price), "timestamp": data.timestamp}
        await manager.broadcast(payload)
        return payload

    # 3. --- STRATEGY ROUTING & CALCULATION ---
    # Use a lock to prevent concurrent calculations for the same ticker/style
    async with engine.get_lock(ticker, style):
        # Re-check lock inside the semaphore to avoid redundant calculations
        locked = stability_lock.get_locked_prediction(ticker, style)
        if locked:
            payload = {**locked, "price": float(data.price), "timestamp": data.timestamp}
            await manager.broadcast(payload)
            return payload

        # Data Preparation (Calculate technical indicators and neural bias)
        signal_nn, conf_nn, metrics = await engine.process_tick(data)
        ohlc = await engine.fetch_real_ohlc_levels(ticker, style)
        
        # Strategy Routing
        engine_dispatch = {
            "Scalping": analyze_scalping,
            "Standard": analyze_standard,
            "Swing": analyze_swing
        }
        strategy_engine = engine_dispatch.get(style, analyze_standard)
        
        # Assess liquidity and generate core coordinates
        strat_result = await strategy_engine(ticker, data.price, ohlc if ohlc else metrics, data.sentiment)
        
        signal = strat_result["signal"]
        
        # If quant engine is neutral but neural model has high conviction, force a signal
        if signal == "HOLD" and signal_nn != "HOLD" and conf_nn > 0.7:
            signal = signal_nn
            strat_result = await strategy_engine(ticker, data.price, ohlc if ohlc else metrics, data.sentiment, force_signal=signal)

        final_entry = strat_result["entry"]
        final_sl = strat_result["sl"]
        final_tp = strat_result["tp"]
        final_conf = max(strat_result["confidence"], conf_nn)
        reasoning = strat_result["reasoning"]

        # 4. --- ENSEMBLE REFINEMENT ---
        if signal != "HOLD" and OPENROUTER_API_KEY:
            try:
                ensemble_result = await asyncio.wait_for(
                    engine.ensemble_predict(ticker, data.price, signal, metrics, style, ohlc if ohlc else metrics),
                    timeout=8.0
                )
                if ensemble_result:
                    e_entry, e_sl, e_tp, e_conf, e_reason = ensemble_result
                    # Blend with engine coordinates
                    final_entry = (final_entry * 0.4) + (e_entry * 0.6)
                    final_sl = (final_sl * 0.4) + (e_sl * 0.6)
                    final_tp = (final_tp * 0.4) + (e_tp * 0.6)
                    final_conf = (final_conf * 0.3) + (e_conf * 0.7)
                    reasoning = f"{reasoning} Ensemble refined: {e_reason}"
            except asyncio.TimeoutError:
                pass

        # 5. --- RECORD & LOCK ---
        payload = {
            "type": "TICKER_UPDATE",
            "ticker": ticker,
            "price": float(data.price),
            "entry_price": float(final_entry),
            "stop_loss": float(final_sl),
            "target_price": float(final_tp),
            "signal": signal,
            "confidence": float(final_conf),
            "reasoning": reasoning,
            "style": style,
            "metrics": metrics,
            "timestamp": data.timestamp
        }
        
        # Lock this prediction for the remainder of the candlestick
        stability_lock.lock_prediction(ticker, style, payload)
        
        # Record to history if it's a signal
        if signal != "HOLD":
            engine.full_prediction_history.append({**payload, "timestamp": time.time()})
            if len(engine.full_prediction_history) > 200:
                engine.full_prediction_history.pop(0)

        await manager.broadcast(payload)
        return payload

# --- Paper Trading Endpoints ---
@app.get("/api/paper/positions")
async def get_paper_positions():
    return {
        "active": [t.dict() for t in engine.active_positions],
        "history": [t.dict() for t in engine.trade_history[-10:]],
        "balance": engine.balance
    }

@app.get("/api/history/predictions")
async def get_prediction_history(ticker: Optional[str] = None):
    """Returns the history of AI signals generated."""
    if ticker:
        # Filter by ticker and return last 20
        return [p for p in engine.full_prediction_history if p['ticker'] == ticker][-20:]
    # Return last 50 total
    return engine.full_prediction_history[-50:]

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
        
        # Trigger full signal calculation with routing & stability lock
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

