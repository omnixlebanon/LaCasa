import { useCurrency } from '../../../global.jsx';
import React from "react";

import { Sparkles, Award, Crown } from "lucide-react";
export const FinancialSummaryBanner = ({ timeframe, totalRevenue, totalProfit, mostSold, mostProfitable }) => {
  const { formatPrice: formatCurrency } = useCurrency();
	const timeframeNames = {
		daily: "Daily Overview (24 Hours)",
		monthly: "Current Month Performance",
		yearly: "Current Year Growth",
		"all-time": "Historical Sales History",
		custom: "Custom Date Range Overview"
	};
	return <div className="bg-gradient-to-r from-white via-emerald-50 to-white border border-emerald-500/20 rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div className="space-y-1.5">
        <div className="flex items-center space-x-2 text-emerald-700 text-xs font-bold uppercase tracking-wider">
          <Sparkles className="w-4 h-4" />
          <span>Executive Summary • {timeframeNames[timeframe]}</span>
        </div>
        <div className="text-sm sm:text-base font-semibold text-slate-800">
          Generated <span className="text-slate-900 font-bold">{formatCurrency(totalRevenue)}</span> in revenue with <span className="text-emerald-700 font-bold">{formatCurrency(totalProfit)}</span> estimated gross profit.
        </div>
      </div>

      {	/* Key Product Badges */}
      <div className="flex flex-wrap items-center gap-3 text-xs">
        {mostSold && <div className="bg-slate-50 border border-amber-500/30 px-3 py-2 rounded-xl flex items-center space-x-2 shadow-sm">
            <Award className="w-4 h-4 text-amber-700 shrink-0" />
            <div>
              <div className="text-[10px] text-amber-700/90 font-bold uppercase">Volume Leader</div>
              <div className="text-slate-800 font-bold truncate max-w-[140px]">
                {mostSold.product.name}
              </div>
            </div>
          </div>}

        {mostProfitable && <div className="bg-slate-50 border border-emerald-500/30 px-3 py-2 rounded-xl flex items-center space-x-2 shadow-sm">
            <Crown className="w-4 h-4 text-emerald-700 shrink-0" />
            <div>
              <div className="text-[10px] text-emerald-700/90 font-bold uppercase">Profit Leader</div>
              <div className="text-slate-800 font-bold truncate max-w-[140px]">
                {mostProfitable.product.name}
              </div>
            </div>
          </div>}
      </div>
    </div>;
};
