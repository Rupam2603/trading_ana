# OmniTrade AI v2.5

Professional-grade real-time market analysis and AI predictive trading dashboard.

## Features
- **Neural-Technical Hybrid Engine**: Combines Temporal Fusion Transformers (TFT) with RSI/EMA cross-validation.
- **Real-Time Data Pipeline**: High-frequency market data ingestion via Yahoo Finance and WebSockets.
- **Interactive Risk Management**: Live Stop Loss and Take Profit targets with a 1:2.5 Reward-to-Risk ratio.
- **Global Multi-Asset Support**: Real-time analysis for 19+ assets including Cryptocurrencies, US Equities, Global Indices, Forex, and Commodities.
- **TradingView Advanced Charting**: Integrated pro-level charting with interactive risk management drawing tools.
- **Responsive Dashboard**: Fully adaptive UI optimized for Desktop, Tablet, and Mobile.

## Project Structure
- `backend/`: FastAPI server with PyTorch inference engine.
- `data_pipeline/`: Real-time market scraper and sentiment analysis module.
- `frontend_web/`: Next.js React dashboard with TradingView integration.
- `frontend_mobile/`: React Native mobile application.

## Getting Started

### Prerequisites
- Python 3.14+
- Node.js 18+
- PyTorch

### Backend Setup
1. `cd backend`
2. `pip install -r requirements.txt` (or install fastapi, uvicorn, torch)
3. `python main.py`

### Data Pipeline Setup
1. `cd data_pipeline`
2. `pip install yfinance aiohttp beautifulsoup4 vaderSentiment`
3. `python data_scraper.py`

### Frontend Setup
1. `cd frontend_web`
2. `npm install`
3. `npm run dev`

## AI Inference Model
The platform uses a custom **Temporal Fusion Transformer (TFT)** architecture optimized for high-frequency time-series data. Signals are validated using a multi-layered technical analysis overlay to ensure high-confidence (>75%) accuracy.

## License
MIT
