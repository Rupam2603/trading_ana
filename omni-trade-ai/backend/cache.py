import time
import math
from typing import Dict, Optional, Any

class StabilityLock:
    """
    Implements the Timeframe Stability Lock.
    Predictions are locked to the duration of a specific candlestick.
    """
    def __init__(self):
        # Store predictions indexed by (ticker, mode)
        self._cache: Dict[tuple, Dict[str, Any]] = {}

    def get_candle_open(self, mode: str) -> int:
        """
        Returns the unix timestamp of the current candle open for a given mode.
        """
        now = int(time.time())
        # Intervals in seconds
        intervals = {
            "Scalping": 60,      # 1 minute candle
            "Standard": 900,     # 15 minute candle
            "Swing": 14400       # 4 hour candle
        }
        interval = intervals.get(mode, 900)
        return (now // interval) * interval

    def get_locked_prediction(self, ticker: str, mode: str) -> Optional[Dict[str, Any]]:
        """
        Retrieves a cached prediction if it's still within the same candlestick.
        """
        candle_open = self.get_candle_open(mode)
        key = (ticker, mode)
        
        if key in self._cache:
            entry = self._cache[key]
            if entry['candle_open'] == candle_open:
                return entry['data']
        return None

    def lock_prediction(self, ticker: str, mode: str, data: Dict[str, Any]):
        """
        Caches a prediction for the duration of the current candlestick.
        """
        candle_open = self.get_candle_open(mode)
        key = (ticker, mode)
        self._cache[key] = {
            'candle_open': candle_open,
            'data': data,
            'locked_at': time.time()
        }

# Global instance
stability_lock = StabilityLock()
