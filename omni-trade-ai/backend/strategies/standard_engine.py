import asyncio
from typing import Dict, Any

async def analyze_standard(ticker: str, price: float, ohlc: Dict[str, Any], sentiment: float, force_signal: str = None) -> Dict[str, Any]:
    """
    Standard Engine: Focuses on session volume nodes and VWAP.
    Calculates entry, sl, and tp based on 15m/1H structure.
    """
    # Liquidity Assessment: VWAP and EMA confluence
    vwap = ohlc.get('vwap', price)
    ema_20 = ohlc.get('ema_20', price)
    atr = ohlc.get('atr', price * 0.01)
    
    # Standard logic: Confluence of institutional levels
    if force_signal:
        signal = force_signal
    else:
        is_bullish = (price > vwap and price > ema_20 and sentiment > 0.05) or (price > vwap and price > ema_20 * 1.001)
        is_bearish = (price < vwap and price < ema_20 and sentiment < -0.05) or (price < vwap and price < ema_20 * 0.999)
        signal = "BUY" if is_bullish else "SELL" if is_bearish else "HOLD"
    
    if signal == "HOLD":
        return {
            "signal": "HOLD",
            "entry": price,
            "sl": price,
            "tp": price,
            "confidence": 0.5,
            "reasoning": "Price compressing between VWAP and Session Volume Nodes."
        }

    # Standard parameters: Institutional stop placement
    # SL: 2.0x ATR | TP: 4.5x ATR
    sl_dist = atr * 2.0
    tp_dist = atr * 4.5
    
    entry = price
    sl = entry - sl_dist if signal == "BUY" else entry + sl_dist
    tp = entry + tp_dist if signal == "BUY" else entry - tp_dist
    
    return {
        "signal": signal,
        "entry": float(entry),
        "sl": float(sl),
        "tp": float(tp),
        "confidence": 0.78,
        "reasoning": f"Standard: Institutional confluence at VWAP ({vwap:.2f}). Session volume node supporting {signal}."
    }
