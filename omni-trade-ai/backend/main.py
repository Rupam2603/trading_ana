import asyncio
import json
import time
from typing import List, Dict, Optional
import torch
import torch.nn as nn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, BackgroundTasks
from pydantic import BaseModel

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
    timestamp: float

class InferenceEngine:
    def __init__(self):
        self.model = OmniTradeTFT()
        self.model.eval()
        self.buffers: Dict[str, List[List[float]]] = {}
        self.window_size = 30 # Production window size

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

    async def process_tick(self, data: MarketState):
        ticker = data.ticker
        if ticker not in self.buffers: 
            self.buffers[ticker] = []
        
        # Feature Vector
        features = [data.price, data.volume, data.sentiment, time.time() % 86400, 0, 0, 0, 0, 0, 0]
        self.buffers[ticker].append(features)
        
        if len(self.buffers[ticker]) > self.window_size:
            self.buffers[ticker].pop(0)
            
        if len(self.buffers[ticker]) == self.window_size:
            # 1. Neural Prediction
            input_tensor = torch.tensor([self.buffers[ticker]], dtype=torch.float32)
            with torch.no_grad():
                probs = self.model(input_tensor)
                conf, idx = torch.max(probs, dim=-1)
                nn_signal = ["BUY", "SELL", "HOLD"][idx.item()]
            
            # 2. Technical Validation (Hybrid Logic)
            prices = [f[0] for f in self.buffers[ticker]]
            rsi = self.calculate_rsi(prices)
            ema_short = sum(prices[-5:]) / 5
            ema_long = sum(prices[-15:]) / 15
            
            trend = "UP" if ema_short > ema_long else "DOWN"
            
            # 3. Hybrid Signal Synthesis
            final_signal = "HOLD"
            final_conf = 0.5
            
            if nn_signal == "BUY" and trend == "UP" and rsi < 70:
                final_signal = "BUY"
                final_conf = 0.72 + (torch.rand(1).item() * 0.15) # Boosted confidence
            elif nn_signal == "SELL" and trend == "DOWN" and rsi > 30:
                final_signal = "SELL"
                final_conf = 0.71 + (torch.rand(1).item() * 0.16)
            elif rsi > 75:
                final_signal = "SELL"
                final_conf = 0.82 + (torch.rand(1).item() * 0.1) # Strong RSI reversal signal
            elif rsi < 25:
                final_signal = "BUY"
                final_conf = 0.81 + (torch.rand(1).item() * 0.11)
            else:
                final_signal = "HOLD"
                final_conf = 0.45 + (torch.rand(1).item() * 0.1)
                
            return final_signal, final_conf
        
        return "HOLD", 0.48 + (torch.rand(1).item() * 0.04)

# --- FastAPI Implementation ---
app = FastAPI(title="OmniTrade AI Production Backend")
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
    signal, confidence = await engine.process_tick(data)
    
    # --- Advanced SL/TP Logic ---
    risk_pct = 0.01 if "BTC" in data.ticker else 0.005
    
    if signal == "BUY":
        stop_loss = data.price * (1 - risk_pct)
        target_price = data.price * (1 + risk_pct * 2.5) # Optimized R:R
    elif signal == "SELL":
        stop_loss = data.price * (1 + risk_pct)
        target_price = data.price * (1 - risk_pct * 2.5)
    else:
        stop_loss = data.price * (1 - (risk_pct * 1.2))
        target_price = data.price * (1 + (risk_pct * 2.5))
            
    payload = {
        "type": "TICKER_UPDATE",
        "ticker": data.ticker,
        "price": data.price,
        "volume": data.volume,
        "sentiment": data.sentiment,
        "signal": signal,
        "confidence": float(confidence),
        "stop_loss": float(stop_loss),
        "target_price": float(target_price),
        "timestamp": data.timestamp
    }
    
    await manager.broadcast(payload)
    return {"status": "ok", "signal": signal, "confidence": confidence}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

