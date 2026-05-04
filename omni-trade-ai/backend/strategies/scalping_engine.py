import asyncio
from typing import Dict, Any, Optional

async def analyze_scalping(ticker: str, price: float, ohlc: Dict[str, Any], sentiment: float, force_signal: Optional[str] = None) -> Dict[str, Any]:
    """
    Scalping Engine: Focuses on micro-liquidity pockets and momentum.
    Calculates entry, sl, and tp based on 1m/5m liquidity clusters.
    """
    # Liquidity Assessment: Proximity to POC and micro-ATR
    atr = ohlc.get('atr', price * 0.005)
    poc = ohlc.get('poc', price)
    
    # Scalping logic: Look for liquidity breakouts near POC
    # We use a tighter sensitivity for scalping
    if force_signal:
        signal = force_signal
    else:
        # Relaxed thresholds: Technical Confluence can override neutral sentiment
        is_bullish = (price > poc and sentiment > 0.02) or (price > poc and price > ohlc.get('ema_20', price) and sentiment >= 0)
        is_bearish = (price < poc and sentiment < -0.02) or (price < poc and price < ohlc.get('ema_20', price) and sentiment <= 0)
        signal = "BUY" if is_bullish else "SELL" if is_bearish else "HOLD"
    
    if signal == "HOLD":
        return {
            "signal": "HOLD",
            "entry": price,
            "sl": price,
            "tp": price,
            "confidence": 0.5,
            "reasoning": "Micro-liquidity neutral around Point of Control (POC)."
        }

    # Scalping parameters: Tight stops, quick targets
    # SL: 1.2x ATR | TP: 2.5x ATR
    sl_dist = atr * 1.2
    tp_dist = atr * 2.5
    
    entry = price
    sl = entry - sl_dist if signal == "BUY" else entry + sl_dist
    tp = entry + tp_dist if signal == "BUY" else entry - tp_dist
    
    return {
        "signal": signal,
        "entry": float(entry),
        "sl": float(sl),
        "tp": float(tp),
        "confidence": 0.82,
        "reasoning": f"Scalping: Liquidity cluster detected at {poc:.2f}. Momentum favoring {signal} breakout."
    }
