import { useCurrency } from '../../../global.jsx';
import React from "react";

import { Activity, ShoppingCart, Globe, ArrowUpRight } from "lucide-react";
export const LiveTransactionsFeed = ({ transactions, isLive }) => {
  const { formatPrice: formatCurrency } = useCurrency();
	const recentTx = transactions.slice(0, 8);
	return <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
      {	/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-3">
        <div className="flex items-center space-x-2">
          <Activity className="w-5 h-5 text-emerald-700" />
          <h2 className="text-base font-bold text-slate-900">Real-Time Sales Feed</h2>
        </div>
        <div className="flex items-center space-x-2 text-xs">
          <span className="relative flex h-2 w-2">
            {isLive && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>}
            <span className={`relative inline-flex rounded-full h-2 w-2 ${isLive ? "bg-emerald-400" : "bg-slate-500"}`}></span>
          </span>
          <span className="text-slate-500 font-medium">
            {isLive ? "Syncing Live" : "Paused"}
          </span>
        </div>
      </div>

      {	/* Transactions List */}
      <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
        {recentTx.length === 0 && <p className="text-sm text-slate-500">No sales in this period.</p>}
        {recentTx.map((tx) => {
		const date = new Date(tx.timestamp);
		const timeStr = date.toLocaleTimeString([], {
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit"
		});
		return <div key={tx.id} className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between hover:border-slate-200 transition-all group">
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-700 border border-emerald-500/20 group-hover:bg-emerald-500/20 transition-all">
                  <ShoppingCart className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-900 flex items-center gap-2">
                    <span>{tx.productName}</span>
                    <span className="text-[10px] text-slate-500 font-normal bg-slate-100 px-1.5 py-0.2 rounded">
                      x{tx.quantity}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                    <span className="flex items-center gap-1">
                      <Globe className="w-3 h-3 text-slate-500" />
                      {tx.customerRegion}
                    </span>
                    <span>•</span>
                    <span className="font-mono text-[10px]">{timeStr}</span>
                  </div>
                </div>
              </div>

              <div className="text-right">
                <div className="text-xs font-bold text-slate-900 flex items-center justify-end gap-1">
                  {formatCurrency(tx.totalRevenue)}
                  <ArrowUpRight className="w-3 h-3 text-emerald-700" />
                </div>
                <div className="text-[10px] text-emerald-700 font-semibold">
                  +{formatCurrency(tx.totalProfit)} profit
                </div>
              </div>
            </div>;
	})}
      </div>
    </div>;
};
