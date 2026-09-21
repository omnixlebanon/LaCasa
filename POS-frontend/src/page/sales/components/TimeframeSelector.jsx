import React from "react";
import { Calendar, Clock, BarChart2, Globe, CalendarDays } from "lucide-react";
export const TimeframeSelector = ({ selectedTimeframe, onSelectTimeframe, customStartDate, customEndDate, onStartDateChange, onEndDateChange }) => {
	const options = [
		{
			id: "daily",
			label: "Daily",
			sub: "Today (24 Hours)",
			icon: <Clock className="w-4 h-4" />
		},
		{
			id: "monthly",
			label: "Monthly",
			sub: "Current Month",
			icon: <Calendar className="w-4 h-4" />
		},
		{
			id: "yearly",
			label: "Yearly",
			sub: "Current Year",
			icon: <BarChart2 className="w-4 h-4" />
		},
		{
			id: "all-time",
			label: "All Time",
			sub: "All Recorded History",
			icon: <Globe className="w-4 h-4" />
		},
		{
			id: "custom",
			label: "Custom Range",
			sub: "Select Dates",
			icon: <CalendarDays className="w-4 h-4" />
		}
	];
	return <div className="bg-white border border-slate-200 rounded-2xl p-3 sm:p-4 shadow-sm space-y-3">
      {	/* Timeframe Buttons */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        {	/* Timeframe Presets Buttons */}
        <div className="sales-timeframe-buttons">
          {options.map((opt) => {
		const isSelected = selectedTimeframe === opt.id;
		return <button key={opt.id} onClick={() => onSelectTimeframe(opt.id)} className={`sales-timeframe-button flex items-center space-x-2 text-xs font-semibold${isSelected ? " is-active" : ""}`}>
                <span>
                  {opt.icon}
                </span>
                <div className="text-left">
                  <div className="leading-tight font-bold">{opt.label}</div>
                  <div className="sales-timeframe-subtitle">
                    {opt.sub}
                  </div>
                </div>
              </button>;
	})}
        </div>

      </div>

      {	/* Custom Date Range Picker inputs - displayed when 'custom' timeframe is selected */}
      {selectedTimeframe === "custom" && <div className="flex flex-wrap items-center gap-3 bg-slate-50 border border-emerald-500/30 p-3 rounded-xl animate-fadeIn">
          <div className="flex items-center space-x-2 text-xs text-emerald-700 font-bold">
            <CalendarDays className="w-4 h-4 text-emerald-700" />
            <span>Custom Date Range:</span>
          </div>

          <div className="flex items-center space-x-2 text-xs">
            <label className="text-slate-500">Start Date:</label>
            <input type="date" value={customStartDate} onChange={(e) => onStartDateChange(e.target.value)} className="bg-white border border-slate-200 text-slate-800 px-2.5 py-1 rounded-lg focus:outline-none focus:border-emerald-500" />
          </div>

          <div className="flex items-center space-x-2 text-xs">
            <label className="text-slate-500">End Date:</label>
            <input type="date" value={customEndDate} onChange={(e) => onEndDateChange(e.target.value)} className="bg-white border border-slate-200 text-slate-800 px-2.5 py-1 rounded-lg focus:outline-none focus:border-emerald-500" />
          </div>

          <div className="text-[11px] text-slate-500 italic ml-auto">
            Filtering dataset between {customStartDate} and {customEndDate}
          </div>
        </div>}
    </div>;
};
