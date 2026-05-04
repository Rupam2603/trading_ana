"use client";

import React, { useEffect, useState, useCallback } from 'react';
import { History, TrendingUp, TrendingDown, Clock, ShieldCheck, Target, Zap, Info } from 'lucide-react';

interface Prediction {
  ticker: string;
  signal: 'BUY' | 'SELL' | 'HOLD';
  price: number;
  entry: number;
  sl: number;
  tp: number;
  confidence: number;
  style: string;
  timestamp: number;
  reasoning: string;
}

export const PredictionHistory = ({ ticker }: { ticker?: string }) => {
  const [history, setHistory] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchHistory = useCallback(async () => {
    try {
      const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || `http://${host}:8000`;
      const url = ticker 
        ? `${apiUrl}/api/history/predictions?ticker=${ticker}`
        : `${apiUrl}/api/history/predictions`;
      
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        // Sort by timestamp descending
        if (Array.isArray(data)) {
          setHistory(data.sort((a: any, b: any) => b.timestamp - a.timestamp));
        } else {
          setHistory([]);
        }
      }
    } catch (e) {
      console.error("Failed to fetch prediction history:", e);
    } finally {
      setLoading(false);
    }
  }, [ticker]);

  useEffect(() => {
    fetchHistory();
    const interval = setInterval(fetchHistory, 10000); // Refresh every 10s
    return () => clearInterval(interval);
  }, [fetchHistory]);

  if (loading && history.length === 0) {
    return (
      <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-8 flex flex-col items-center justify-center gap-3">
        <History size={24} className="text-zinc-700 animate-spin" />
        <span className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest">Synchronizing Neural History...</span>
      </div>
    );
  }

  return (
    <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl overflow-hidden backdrop-blur-md shadow-2xl transition-all">
      <div className="p-4 border-b border-zinc-800/50 flex items-center justify-between bg-black/20">
        <div className="flex items-center gap-2">
          <History size={16} className="text-purple-400" />
          <h3 className="text-xs font-black uppercase tracking-widest text-zinc-300">AI Prediction History</h3>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-[10px] text-zinc-500 font-bold uppercase">
            <Clock size={12} className="text-zinc-600" />
            <span>Real-time Log</span>
          </div>
          <div className="h-4 w-px bg-zinc-800" />
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-500/80">
            <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
            LIVE_SYNC
          </div>
        </div>
      </div>

      <div className="overflow-x-auto scrollbar-hide">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-zinc-900/50 text-[9px] text-zinc-500 uppercase font-black border-b border-zinc-800/50">
              <th className="px-4 py-3">Timestamp</th>
              <th className="px-4 py-3">Instrument</th>
              <th className="px-4 py-3">Consensus</th>
              <th className="px-4 py-3 text-right">Market Price</th>
              <th className="px-4 py-3 text-right">AI Entry</th>
              <th className="px-4 py-3">Risk/Reward Parameters</th>
              <th className="px-4 py-3">Confidence</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/30">
            {history.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-16 text-center">
                  <div className="flex flex-col items-center gap-2 opacity-40">
                    <Zap size={32} />
                    <p className="text-xs text-zinc-500 italic">No historical signals detected in current session.</p>
                  </div>
                </td>
              </tr>
            ) : (
              history.map((item, idx) => {
                const date = new Date(item.timestamp * 1000);
                const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                const rr = Math.abs(item.tp - item.entry) / Math.abs(item.entry - item.sl);
                
                return (
                  <tr key={idx} className="group hover:bg-white/[0.03] transition-all border-l-2 border-transparent hover:border-purple-500/50">
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span className="text-[10px] font-mono text-zinc-500">{timeStr}</span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="flex flex-col">
                        <span className="text-xs font-black text-zinc-200 tracking-tight">{item.ticker}</span>
                        <span className="text-[8px] text-zinc-600 uppercase font-bold tracking-tighter">{item.style} MODE</span>
                      </div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-black border ${
                        item.signal === 'BUY' 
                          ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' 
                          : 'bg-rose-500/10 text-rose-500 border-rose-500/20'
                      }`}>
                        {item.signal === 'BUY' ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                        {item.signal}
                      </div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-right">
                      <span className="text-[11px] font-mono font-bold text-zinc-400">${item.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-right">
                       <span className="text-[11px] font-mono font-black text-cyan-400">${item.entry.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-4">
                        <div className="flex flex-col">
                          <div className="flex items-center gap-1">
                            <ShieldCheck size={10} className="text-rose-500/50" />
                            <span className="text-[10px] font-mono text-rose-500/80">{item.sl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Target size={10} className="text-emerald-500/50" />
                            <span className="text-[10px] font-mono text-emerald-500/80">{item.tp.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          </div>
                        </div>
                        <div className="px-2 py-0.5 rounded bg-purple-500/10 text-[9px] font-black text-purple-400 border border-purple-500/20">
                          1:{rr.toFixed(1)} RR
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="flex flex-col gap-1 w-24">
                        <div className="flex justify-between items-center text-[9px] font-bold">
                          <span className="text-zinc-600">ENSEMBLE</span>
                          <span className="text-blue-400">{(item.confidence * 100).toFixed(0)}%</span>
                        </div>
                        <div className="h-1 bg-zinc-800/50 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-gradient-to-r from-blue-600 to-indigo-500 transition-all duration-1000" 
                            style={{ width: `${item.confidence * 100}%` }} 
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2 group/tip relative">
                         <div className="px-2 py-0.5 rounded-full border border-blue-500/20 bg-blue-500/5 text-[8px] font-black text-blue-400 uppercase tracking-tighter cursor-help">
                            SIGNAL_ARCHIVED
                         </div>
                         <Info size={12} className="text-zinc-700 hover:text-zinc-400 cursor-help" />
                         
                         {/* Hover Tooltip for Reasoning */}
                         <div className="absolute bottom-full right-0 mb-2 w-64 p-3 bg-zinc-900 border border-zinc-800 rounded-lg shadow-2xl opacity-0 group-hover/tip:opacity-100 transition-opacity pointer-events-none z-10 backdrop-blur-xl">
                           <div className="text-[8px] text-zinc-500 font-bold uppercase mb-1">AI Reasoning Engine</div>
                           <p className="text-[10px] text-zinc-300 leading-relaxed italic">&quot;{item.reasoning}&quot;</p>
                         </div>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      
      <div className="p-3 bg-black/40 border-t border-zinc-800/50 flex items-center justify-between px-6">
        <div className="flex items-center gap-4 text-[9px] font-bold text-zinc-600">
          <div className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span>BULLISH_BIAS</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-rose-500" />
            <span>BEARISH_BIAS</span>
          </div>
        </div>
        <button 
          onClick={() => setHistory([])}
          className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-500 hover:text-rose-400 transition-colors flex items-center gap-2 group"
        >
          <Zap size={10} className="text-zinc-600 group-hover:text-yellow-500 transition-colors" />
          Clear Log
        </button>
      </div>
    </div>
  );
};
