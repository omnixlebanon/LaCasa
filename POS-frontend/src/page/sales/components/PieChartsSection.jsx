import PaymentPieChart from './PaymentPieChart.jsx';
import CostPieChart from './CostPieChart.jsx';
import { groupSmallSlices } from '../utils/pie.js';
import { useCurrency } from '../../../global.jsx';
import React, { useState } from "react";
import { formatNumber, PRODUCT_COLORS } from "../utils/analytics";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from "recharts";
export const PieChartsSection = ({ productMetrics, categorySummaries, ingredientCost, expenses, payrollCost, missingCosts, transactions }) => {
  const { formatPrice: formatCurrency } = useCurrency();
	const [activeTab, setActiveTab] = useState("units");
	// Filter out zero values
	const activeProducts = productMetrics.filter((m) => m.totalRevenue > 0);
	// 1. Units Sold Pie Data (For Most Sold Product breakdown)
	const unitsPieData = groupSmallSlices(activeProducts.map((m, idx) => ({
		name: m.product.name,
		value: m.unitsSold,
		rawCurrency: m.totalRevenue,
		color: PRODUCT_COLORS[idx % PRODUCT_COLORS.length],
		isHighlight: m.isMostSold,
		margin: m.profitMargin
	})));
	// 3. Category Share Donut Data
	const categoryPieData = groupSmallSlices(categorySummaries.map((c) => ({
		name: c.category,
		value: c.revenue,
		profit: c.profit,
		color: c.color
	})));
	return <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
      {	/* Header & Tabs */}
      <div className="flex flex-col items-start gap-3 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center space-x-2">
            
            <h2 className="text-base font-bold text-slate-900">Sales &amp; Cost Breakdown</h2>
          </div>
        </div>

        {	/* Mode Tabs */}
        <div className="sales-chart-tabs">
          <button onClick={() => setActiveTab("units")} className={`sales-chart-tab${activeTab === "units" ? " is-active" : ""}`}>
            
            <span>Most Sold (Units)</span>
          </button>
          <button onClick={() => setActiveTab("payments")} className={`sales-chart-tab${activeTab === "payments" ? " is-active" : ""}`}>
            
            <span>Cash / WHISH</span>
          </button>
          <button onClick={() => setActiveTab("categories")} className={`sales-chart-tab${activeTab === "categories" ? " is-active" : ""}`}>
            
            <span>Categories</span>
          </button>
          <button onClick={() => setActiveTab("costs")} aria-pressed={activeTab === "costs"} className={`sales-chart-tab${activeTab === "payments" ? <PaymentPieChart transactions={transactions} /> : activeTab === "costs" ? " is-active" : ""}`}><span>Total Cost by Expense</span></button>
        </div>
      </div>

      {	/* Pie Chart */}
      {activeTab === "payments" ? <PaymentPieChart transactions={transactions} /> : activeTab === "costs" ? <CostPieChart ingredientCost={ingredientCost} expenses={expenses} payrollCost={payrollCost} missingCosts={missingCosts} /> : <div className="w-full">
        {	/* Chart Canvas */}
        <div className="sales-pie-canvas h-72 w-full flex items-center justify-center">
          <ResponsiveContainer width="100%" height="100%">
            {activeTab === "units" ? <PieChart>
                <Pie data={unitsPieData} cx="50%" cy="50%" outerRadius={100} innerRadius={50} paddingAngle={3} dataKey="value" label={({ percent }) => percent > .05 ? `${(percent * 100).toFixed(0)}%` : ""}>
                  {unitsPieData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} stroke={entry.isHighlight ? "#34485E" : "#ffffff"} strokeWidth={entry.isHighlight ? 3 : 1} />)}
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
              </PieChart> : <PieChart>
                <Pie data={categoryPieData} cx="50%" cy="50%" outerRadius={100} innerRadius={60} paddingAngle={4} dataKey="value" label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}>
                  {categoryPieData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                </Pie>
                <Tooltip contentStyle={{
		backgroundColor: "#ffffff",
		borderColor: "#dfe7e2",
		borderRadius: "12px",
		fontSize: "12px"
	}} formatter={(value, name, item) => [`${formatCurrency(Number(value))} Sales | Gross profit: ${item.payload.profit === null ? 'Unavailable' : formatCurrency(item.payload.profit)}`, item.payload.name]} />
                <Legend verticalAlign="bottom" height={36} wrapperStyle={{
		fontSize: "11px",
		paddingTop: "10px"
	}} />
              </PieChart>}
          </ResponsiveContainer>
        </div>

      </div>}
    </div>;
};

