"use client";

import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import { Search, X, Bitcoin, TrendingUp, BarChart2, Globe, Gem } from "lucide-react";

// ---- Full asset catalogue ----
const ASSET_CATALOGUE = [
  // Crypto
  { id: "BTCUSD",    label: "Bitcoin",       sub: "BTC/USD",      cat: "Crypto",     tv: "BINANCE:BTCUSDT" },
  { id: "ETHUSD",    label: "Ethereum",      sub: "ETH/USD",      cat: "Crypto",     tv: "BINANCE:ETHUSDT" },
  { id: "SOLUSD",    label: "Solana",        sub: "SOL/USD",      cat: "Crypto",     tv: "BINANCE:SOLUSDT" },
  { id: "BNBUSD",    label: "BNB",           sub: "BNB/USD",      cat: "Crypto",     tv: "BINANCE:BNBUSDT" },
  { id: "XRPUSD",    label: "Ripple",        sub: "XRP/USD",      cat: "Crypto",     tv: "BINANCE:XRPUSDT" },
  { id: "DOGEUSD",   label: "Dogecoin",      sub: "DOGE/USD",     cat: "Crypto",     tv: "BINANCE:DOGEUSDT" },
  // Stocks
  { id: "TSLA",      label: "Tesla",         sub: "NASDAQ:TSLA",  cat: "Stocks",     tv: "NASDAQ:TSLA" },
  { id: "NVDA",      label: "NVIDIA",        sub: "NASDAQ:NVDA",  cat: "Stocks",     tv: "NASDAQ:NVDA" },
  { id: "AAPL",      label: "Apple",         sub: "NASDAQ:AAPL",  cat: "Stocks",     tv: "NASDAQ:AAPL" },
  { id: "MSFT",      label: "Microsoft",     sub: "NASDAQ:MSFT",  cat: "Stocks",     tv: "NASDAQ:MSFT" },
  { id: "AMZN",      label: "Amazon",        sub: "NASDAQ:AMZN",  cat: "Stocks",     tv: "NASDAQ:AMZN" },
  { id: "GOOGL",     label: "Alphabet",      sub: "NASDAQ:GOOGL", cat: "Stocks",     tv: "NASDAQ:GOOGL" },
  { id: "META",      label: "Meta",          sub: "NASDAQ:META",  cat: "Stocks",     tv: "NASDAQ:META" },
  // Forex
  { id: "EURUSD",    label: "Euro / Dollar", sub: "EUR/USD",      cat: "Forex",      tv: "FX:EURUSD" },
  { id: "GBPUSD",    label: "Pound / Dollar",sub: "GBP/USD",      cat: "Forex",      tv: "FX:GBPUSD" },
  { id: "USDJPY",    label: "Dollar / Yen",  sub: "USD/JPY",      cat: "Forex",      tv: "FX:USDJPY" },
  { id: "AUDUSD",    label: "Aussie Dollar", sub: "AUD/USD",      cat: "Forex",      tv: "FX:AUDUSD" },
  { id: "USDCAD",    label: "Dollar / CAD",  sub: "USD/CAD",      cat: "Forex",      tv: "FX:USDCAD" },
  // Indices
  { id: "SPX",       label: "S&P 500",       sub: "TVC:SPX",      cat: "Indices",    tv: "TVC:SPX" },
  { id: "IXIC",      label: "NASDAQ Comp.",  sub: "TVC:IXIC",     cat: "Indices",    tv: "TVC:IXIC" },
  { id: "DJI",       label: "Dow Jones",     sub: "TVC:DJI",      cat: "Indices",    tv: "TVC:DJI" },
  { id: "NIFTY",     label: "Nifty 50",      sub: "NSE:NIFTY",    cat: "Indices",    tv: "NSE:NIFTY" },
  { id: "BANKNIFTY", label: "Bank Nifty",    sub: "NSE:BANKNIFTY",cat: "Indices",    tv: "NSE:BANKNIFTY" },
  // Commodities
  { id: "XAUUSD",    label: "Gold",          sub: "XAU/USD",      cat: "Commodities",tv: "TVC:GOLD" },
  { id: "SILVER",    label: "Silver",        sub: "XAG/USD",      cat: "Commodities",tv: "TVC:SILVER" },
  { id: "USOIL",     label: "Crude Oil",     sub: "WTI",          cat: "Commodities",tv: "TVC:USOIL" },
];

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  Crypto:      <Bitcoin size={11} />,
  Stocks:      <TrendingUp size={11} />,
  Forex:       <Globe size={11} />,
  Indices:     <BarChart2 size={11} />,
  Commodities: <Gem size={11} />,
};

const CATEGORIES = ["All", "Crypto", "Stocks", "Forex", "Indices", "Commodities"] as const;

interface AssetSearchProps {
  selectedId: string;
  onSelect: (id: string, tvSymbol: string) => void;
}

export function AssetSearch({ selectedId, onSelect }: AssetSearchProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("All");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const currentAsset = ASSET_CATALOGUE.find((a) => a.id === selectedId);

  const filtered = ASSET_CATALOGUE.filter((a) => {
    const matchCat = activeCategory === "All" || a.cat === activeCategory;
    const q = query.toLowerCase();
    const matchQ =
      !q ||
      a.id.toLowerCase().includes(q) ||
      a.label.toLowerCase().includes(q) ||
      a.sub.toLowerCase().includes(q);
    return matchCat && matchQ;
  });

  // Close on outside click / tap
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [open]);

  const handleSelect = useCallback(
    (asset: (typeof ASSET_CATALOGUE)[number]) => {
      onSelect(asset.id, asset.tv);
      setOpen(false);
      setQuery("");
    },
    [onSelect]
  );

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Trigger button */}
      <button
        onClick={() => {
          setOpen((o) => !o);
          setTimeout(() => inputRef.current?.focus(), 80);
        }}
        className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-left transition-all"
        style={{
          background: open ? "var(--surface-2)" : "var(--surface)",
          border: `1px solid ${open ? "var(--neutral)" : "var(--border)"}`,
          color: "var(--text-primary)",
          boxShadow: open ? `0 0 0 2px rgba(179,136,255,0.15)` : "none",
        }}
      >
        <Search size={13} style={{ color: "var(--neutral)" }} />
        <span className="flex-1 text-[11px] font-bold truncate">
          {currentAsset ? `${currentAsset.id} — ${currentAsset.label}` : "Search assets..."}
        </span>
        <span
          className="text-[9px] px-1.5 py-0.5 rounded"
          style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}
        >
          {currentAsset?.cat ?? ""}
        </span>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          className="absolute left-0 right-0 z-50 mt-1.5 rounded-xl overflow-hidden shadow-2xl animate-fade-drop"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            maxHeight: "380px",
          }}
        >
          {/* Search input */}
          <div
            className="flex items-center gap-2 px-3 py-2.5"
            style={{ borderBottom: "1px solid var(--border)" }}
          >
            <Search size={12} style={{ color: "var(--text-muted)" }} />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or ticker..."
              className="flex-1 bg-transparent outline-none text-xs"
              style={{ color: "var(--text-primary)" }}
            />
            {query && (
              <button onClick={() => setQuery("")}>
                <X size={12} style={{ color: "var(--text-muted)" }} />
              </button>
            )}
          </div>

          {/* Category tabs */}
          <div
            className="flex gap-1 px-2 py-1.5 overflow-x-auto scrollbar-hide"
            style={{ borderBottom: "1px solid var(--border)" }}
          >
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-bold whitespace-nowrap transition-all"
                style={{
                  background: activeCategory === cat ? "var(--neutral)" : "var(--surface-2)",
                  color: activeCategory === cat ? "#000" : "var(--text-muted)",
                  border: "1px solid",
                  borderColor: activeCategory === cat ? "var(--neutral)" : "transparent",
                }}
              >
                {cat !== "All" && CATEGORY_ICONS[cat]}
                {cat}
              </button>
            ))}
          </div>

          {/* Asset list */}
          <div className="overflow-y-auto" style={{ maxHeight: "270px" }}>
            {filtered.length === 0 ? (
              <div
                className="py-8 text-center text-xs italic"
                style={{ color: "var(--text-muted)" }}
              >
                No assets found
              </div>
            ) : (
              filtered.map((asset) => (
                <button
                  key={asset.id}
                  onClick={() => handleSelect(asset)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left transition-all group"
                  style={{
                    background: asset.id === selectedId ? "var(--blue-soft)" : "transparent",
                    borderLeft: asset.id === selectedId
                      ? `2px solid var(--bullish)`
                      : "2px solid transparent",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = "var(--violet-soft)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background =
                      asset.id === selectedId ? "var(--blue-soft)" : "transparent")
                  }
                >
                  <div
                    className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0"
                    style={{ background: "var(--surface-2)", color: "var(--neutral)" }}
                  >
                    {CATEGORY_ICONS[asset.cat]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div
                      className="text-[11px] font-bold truncate"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {asset.id}
                    </div>
                    <div className="text-[9px] truncate" style={{ color: "var(--text-muted)" }}>
                      {asset.label}
                    </div>
                  </div>
                  <span
                    className="text-[8px] px-1.5 py-0.5 rounded"
                    style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}
                  >
                    {asset.sub}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Export catalogue for use in Dashboard
export { ASSET_CATALOGUE };
