import asyncio
import aiohttp
import yfinance as yf
import logging
import time
from datetime import datetime
from bs4 import BeautifulSoup
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

import os
from dotenv import load_dotenv

load_dotenv()

# --- Configuration ---
BACKEND_URL = "http://localhost:8000/api/ingest"
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
LLM_MODEL = "anthropic/claude-3.5-sonnet" # Upgraded for perfect scalping precision
TICKER_MAP = {
    "BTC-USD": "BTCUSD",
    "ETH-USD": "ETHUSD",
    "SOL-USD": "SOLUSD",
    "TSLA": "TSLA",
    "NVDA": "NVDA",
    "AAPL": "AAPL",
    "MSFT": "MSFT",
    "AMZN": "AMZN",
    "GC=F": "XAUUSD",
    "SI=F": "SILVER",
    "CL=F": "USOIL",
    "EURUSD=X": "EURUSD",
    "GBPUSD=X": "GBPUSD",
    "JPY=X": "USDJPY",
    "^GSPC": "SPX",
    "^IXIC": "IXIC",
    "^DJI": "DJI",
    "^NSEI": "NIFTY",
    "^NSEBANK": "BANKNIFTY"
}

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger("OmniScraper")
analyzer = SentimentIntensityAnalyzer()

class OmniDataScraper:
    def __init__(self):
        self.session = None

    async def init_session(self):
        if self.session is None:
            self.session = aiohttp.ClientSession()

    async def get_market_data(self, yf_ticker: str):
        """Fetches latest price and volume from Yahoo Finance."""
        try:
            ticker = yf.Ticker(yf_ticker)
            data = ticker.fast_info
            return {
                "price": data.last_price,
                "volume": data.last_volume if hasattr(data, 'last_volume') else 0.0
            }
        except Exception as e:
            logger.error(f"Error fetching {yf_ticker}: {e}")
            return None

    async def get_llm_analysis(self, headlines: List[str]):
        """Uses OpenRouter (Nemotron) to analyze market sentiment and reasoning."""
        if not OPENROUTER_API_KEY:
            return None, "API Key missing. Using VADER fallback."
        
        url = "https://openrouter.ai/api/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {OPENROUTER_API_KEY}",
            "Content-Type": "application/json"
        }
        prompt = (
            "Analyze these financial headlines. Return ONLY a JSON object with: "
            "'score' (float between -1 and 1) and 'reasoning' (max 15 words analysis). "
            f"Headlines: {' | '.join(headlines)}"
        )
        
        try:
            async with self.session.post(url, headers=headers, json={
                "model": LLM_MODEL,
                "messages": [{"role": "user", "content": prompt}],
                "response_format": {"type": "json_object"}
            }) as resp:
                if resp.status == 200:
                    res = await resp.json()
                    content = json.loads(res['choices'][0]['message']['content'])
                    return content.get('score', 0.0), content.get('reasoning', "Stable market conditions.")
                return None, "LLM Offline."
        except Exception as e:
            logger.error(f"LLM Error: {e}")
            return None, "Analysis error."

    async def get_sentiment(self):
        """Scrapes headlines and returns (sentiment_score, reasoning)."""
        try:
            async with self.session.get("https://news.google.com/rss/search?q=finance+market") as resp:
                text = await resp.text()
                soup = BeautifulSoup(text, 'xml')
                headlines = [item.title.text for item in soup.find_all('item')[:10]]
                
                # Try LLM first
                llm_score, reasoning = await self.get_llm_analysis(headlines)
                if llm_score is not None:
                    return llm_score, reasoning
                
                # Fallback to VADER
                scores = [analyzer.polarity_scores(h)['compound'] for h in headlines]
                avg_sentiment = sum(scores) / len(scores) if scores else 0.0
                return avg_sentiment, "VADER basic sentiment analysis."
        except Exception as e:
            logger.error(f"Error scraping news: {e}")
            return 0.0, "Sentiment data unavailable."

    async def push_to_backend(self, payload: dict):
        """Sends data to the FastAPI ingestion endpoint."""
        try:
            async with self.session.post(BACKEND_URL, json=payload) as resp:
                if resp.status != 200:
                    logger.warning(f"Backend push failed: {resp.status}")
        except Exception as e:
            logger.error(f"Error connecting to backend: {e}")

    async def run(self):
        await self.init_session()
        logger.info("OmniTrade Pipeline ONLINE. Fetching real market data...")
        
        while True:
            # 1. Get Global Sentiment & Reasoning
            sentiment, reasoning = await self.get_sentiment()
            
            # 2. Fetch all Tickers
            for yf_id, internal_id in TICKER_MAP.items():
                data = await self.get_market_data(yf_id)
                if data:
                    payload = {
                        "ticker": internal_id,
                        "price": data["price"],
                        "volume": data["volume"],
                        "sentiment": sentiment,
                        "reasoning": reasoning,
                        "timestamp": time.time()
                    }
                    await self.push_to_backend(payload)
                    logger.info(f"Pushed {internal_id}: ${data['price']:.2f} | Sent: {sentiment:.2f}")
            
            await asyncio.sleep(5) # Adaptive frequency

if __name__ == "__main__":
    scraper = OmniDataScraper()
    asyncio.run(scraper.run())

