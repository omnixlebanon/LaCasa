import { useCurrency } from '../../../global.jsx';
import React, { useState } from "react";
import { formatNumber, PRODUCT_COLORS } from "../utils/analytics";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from "recharts";
export const PieChartsSection = ({ productMetrics, categorySummaries }) => {
  const { formatPrice: formatCurrency, currencyLabel } = useCurrency();
	const [activeTab, setActiveTab] = useState("units");
	// Filter out zero values
	const activeProducts = productMetrics.filter((m) => m.totalRevenue > 0);
	// 1. Units Sold Pie Data (For Most Sold Product breakdown)
	const unitsPieData = activeProducts.map((m, idx) => ({
		name: m.product.name,
		value: m.unitsSold,
		rawCurrency: m.totalRevenue,
		color: PRODUCT_COLORS[idx % PRODUCT_COLORS.length],
		isHighlight: m.isMostSold,
		margin: m.profitMargin
	}));
	// 2. Profit Share Pie Data (For Most Profitable Product breakdown)
	const profitPieData = activeProducts.filter((m) => m.totalProfit > 0).map((m, idx) => ({
		name: m.product.name,
		value: m.totalProfit,
		rawCurrency: m.totalProfit,
		color: PRODUCT_COLORS[idx % PRODUCT_COLORS.length],
		isHighlight: m.isMostProfitable,
		margin: m.profitMargin
	}));
	// 3. Category Share Donut Data
	const categoryPieData = categorySummaries.map((c) => ({
		name: c.category,
		value: c.revenue,
		profit: c.profit,
		color: c.color
	}));
	return <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
      {	/* Header & Tabs */}
      <div className="flex flex-col items-start gap-3 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center space-x-2">
            
            <h2 className="text-base font-bold text-slate-900">Product Share Pie Charts</h2>
          </div>
        </div>

        {	/* Mode Tabs */}
        <div className="sales-chart-tabs">
          <button onClick={() => setActiveTab("units")} className={`sales-chart-tab${activeTab === "units" ? " is-active" : ""}`}>
            
            <span>Most Sold (Units)</span>
          </button>
          <button onClick={() => setActiveTab("profit")} className={`sales-chart-tab${activeTab === "profit" ? " is-active" : ""}`}>
            
            <span>Most Profitable ({currencyLabel})</span>
          </button>
          <button onClick={() => setActiveTab("categories")} className={`sales-chart-tab${activeTab === "categories" ? " is-active" : ""}`}>
            
            <span>Categories</span>
          </button>
        </div>
      </div>

      {	/* Pie Chart */}
      <div className="w-full">
        {	/* Chart Canvas */}
        <div className="h-72 w-full flex items-center justify-center">
          <ResponsiveContainer width="100%" height="100%">
            {activeTab === "units" ? <PieChart>
                <Pie data={unitsPieData} cx="50%" cy="50%" outerRadius={100} innerRadius={50} paddingAngle={3} dataKey="value" label={({ percent }) => percent > .05 ? `${(percent * 100).toFixed(0)}%` : ""}>
                  {unitsPieData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} stroke={entry.isHighlight ? "#048853" : "#ffffff"} strokeWidth={entry.isHighlight ? 3 : 1} />)}
                </Pie>
                <Tooltip contentStyle={{
		backgroundColor: "#ffffff",
		borderColor: "#dfe7e2",
		borderRadius: "12px",
		fontSize: "12px"
	}} formatter={(value, name, item) => [`${formatNumber(Number(value))} units (${formatCurrency(item.payload.rawCurrency)})`, item.payload.name]} />
                <Legend verticalAlign="bottom" height={36} wrapperStyle={{
		fontSize: "11px",
		paddingTop: "10px"
	}} />
              </PieChart> : activeTab === "profit" ? <PieChart>
                <Pie data={profitPieData} cx="50%" cy="50%" outerRadius={100} innerRadius={50} paddingAngle={3} dataKey="value" label={({ percent }) => percent > .05 ? `${(percent * 100).toFixed(0)}%` : ""}>
                  {profitPieData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} stroke={entry.isHighlight ? "#398d9c" : "#ffffff"} strokeWidth={entry.isHighlight ? 3 : 1} />)}
                </Pie>
                <Tooltip contentStyle={{
		backgroundColor: "#ffffff",
		borderColor: "#dfe7e2",
		borderRadius: "12px",
		fontSize: "12px"
	}} formatter={(value, name, item) => [`${formatCurrency(Number(value))} estimated gross profit (${item.payload.margin}% margin)`, item.payload.name]} />
                <Legend verticalAlign="bottom" height={36} wrapperStyle={{
		fontSize: "11px",
		paddingTop: "10px"
	}} />
              </PieChart> : <PieChart>
                <Pie data={categoryPieData} cx="50%" cy="50%" outerRadius={100} innerRadius={60} paddingAngle={4} dataKey="value" label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}>
                  {categoryPieData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                </Pie>
                <Tooltip contentStyle={{
		backgroundColor: "#ffffff",
		borderColor: "#dfe7e2",
		borderRadius: "12px",
		fontSize: "12px"
	}} formatter={(value, name, item) => [`${formatCurrency(Number(value))} Sales | Profit: ${formatCurrency(item.payload.profit)}`, item.payload.name]} />
                <Legend verticalAlign="bottom" height={36} wrapperStyle={{
		fontSize: "11px",
		paddingTop: "10px"
	}} />
              </PieChart>}
          </ResponsiveContainer>
        </div>

      </div>
    </div>;
};

