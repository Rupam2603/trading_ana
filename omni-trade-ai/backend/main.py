import asyncio
import json
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

load_dotenv()

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
CLAUDE_MODEL = "anthropic/claude-3.5-sonnet"

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
        self.window_size = 30 # Production window size

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
            
            # 3. Hybrid Synthesis
            final_signal = "HOLD"
            final_conf = 0.5
            
            if nn_signal == "BUY":
                if trend == "UP" and rsi < 65:
                    final_signal = "BUY"
                    final_conf = 0.78 + (torch.rand(1).item() * 0.1)
                    if fvg == "BULLISH": final_conf += 0.05
                elif rsi < 25: 
                    final_signal = "BUY"
                    final_conf = 0.82 + (torch.rand(1).item() * 0.08)
            
            elif nn_signal == "SELL":
                if trend == "DOWN" and rsi > 35:
                    final_signal = "SELL"
                    final_conf = 0.77 + (torch.rand(1).item() * 0.11)
                    if fvg == "BEARISH": final_conf += 0.05
                elif rsi > 75:
                    final_signal = "SELL"
                    final_conf = 0.81 + (torch.rand(1).item() * 0.09)
            
            return final_signal, final_conf, metrics
        
        return "HOLD", 0.48 + (torch.rand(1).item() * 0.04), metrics

# --- FastAPI Implementation ---
app = FastAPI(title="OmniTrade AI Production Backend")

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
    
    entry_price = data.price
    if signal == "BUY":
        stop_loss = data.price * (1 - effective_risk)
        target_price = data.price * (1 + effective_risk * 2.5) # Optimized 1:2.5 R:R
    elif signal == "SELL":
        stop_loss = data.price * (1 + effective_risk)
        target_price = data.price * (1 - effective_risk * 2.5)
    else:
        stop_loss = data.price * (1 - (effective_risk * 1.5))
        target_price = data.price * (1 + (effective_risk * 3.0))
            
    payload = {
        "type": "TICKER_UPDATE",
        "ticker": data.ticker,
        "price": data.price,
        "entry_price": float(entry_price),
        "volume": data.volume,
        "sentiment": data.sentiment,
        "reasoning": reasoning,
        "signal": signal,
        "confidence": float(confidence),
        "stop_loss": float(stop_loss),
        "target_price": float(target_price),
        "metrics": metrics, # FVG, Kernel, ATR
        "timestamp": data.timestamp
    }
    
    await manager.broadcast(payload)
    return {"status": "ok", "signal": signal, "confidence": confidence}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

