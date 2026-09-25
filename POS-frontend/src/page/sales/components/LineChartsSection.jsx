import { useCurrency } from '../../../global.jsx';
import React, { useState, useRef } from "react";
import useMobile from '../../../hooks/useMobile.js';
import { Search, X } from "lucide-react";
import { formatNumber, PRODUCT_COLORS } from "../utils/analytics";
import { ResponsiveContainer, AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
export const LineChartsSection = ({ data, products, metricView = "all", onMetricViewChange, missingCosts = 0 }) => {
  const isMobile = useMobile();
  const { formatPrice: formatCurrency, formatCompactPrice } = useCurrency();
	const [productSearch, setProductSearch] = useState("");
	const productSliderRef = useRef(null);
	const productSearchRef = useRef(null);
	const filteredProducts = products.map((product, index) => ({ product, index })).filter(({ product }) => product.name.toLowerCase().includes(productSearch.trim().toLowerCase()));
	const updateProductSearch = value => {
		setProductSearch(value);
		if (productSliderRef.current) productSliderRef.current.scrollLeft = 0;
	};
	const [chartMode, setChartMode] = useState("financials");
	const [selectedProductIds, setSelectedProductIds] = useState(products.slice(0, 4).map((p) => p.id));
	const toggleProductFilter = (id) => {
		if (selectedProductIds.includes(id)) {
			if (selectedProductIds.length > 1) {
				setSelectedProductIds(selectedProductIds.filter((pid) => pid !== id));
			}
		} else {
			setSelectedProductIds([...selectedProductIds, id]);
		}
	};
	const showRevenue = metricView === "all" || metricView === "sales";
	const showCost = !missingCosts && (metricView === "all" || metricView === "cost");
	const showProfit = !missingCosts && (metricView === "all" || metricView === "profit");
	return <div className="sales-line-chart bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
      {	/* Chart Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center space-x-2">
            
            <h2 className="text-base font-bold text-slate-900">Financial Line Charts</h2>
          </div>
        </div>

        {	/* View Toggles */}
        <div className="sales-chart-tabs">
          <button onClick={() => setChartMode("financials")} className={`sales-chart-tab${chartMode === "financials" ? " is-active" : ""}`}>
            Financial Trends
          </button>
          <button onClick={() => setChartMode("units")} className={`sales-chart-tab${chartMode === "units" ? " is-active" : ""}`}>
            Units Sold
          </button>
          <button onClick={() => setChartMode("products")} className={`sales-chart-tab${chartMode === "products" ? " is-active" : ""}`}>
            Product Breakdown
          </button>
        </div>
      </div>

      <div className="sales-chart-metric">
        <select aria-label="Chart metric" value={metricView} onChange={(event) => {
          onMetricViewChange(event.target.value);
          setChartMode("financials");
        }}>
          <option value="all">All metrics</option>
          <option value="sales">Sales</option>
          <option value="cost">Cost</option>
          <option value="profit">Result after expenses</option>
        </select>
      </div>

      {	/* Product Filter Chips for Product Breakdown Mode */}
      {chartMode === "products" && <div className="sales-breakdown-filters">
          <div className="sales-breakdown-toolbar">
            <span>Toggle Products:</span>
            <div className="sales-breakdown-search">
              <Search size={16} aria-hidden="true" />
              <input ref={productSearchRef} type="search" aria-label="Search products in breakdown" placeholder="Search products..." value={productSearch} onChange={event => updateProductSearch(event.target.value)} />
              {productSearch && <button type="button" aria-label="Clear product search" onClick={() => { updateProductSearch(''); productSearchRef.current?.focus(); }}><X size={16} aria-hidden="true" /></button>}
            </div>
          </div>
          <div ref={productSliderRef} className="sales-breakdown-slider" role="region" aria-label="Choose products for the breakdown; scroll horizontally for more" tabIndex={0}>
          {filteredProducts.map(({ product: p, index: idx }) => {
		const isChecked = selectedProductIds.includes(p.id);
		const color = PRODUCT_COLORS[idx % PRODUCT_COLORS.length];
		return <button key={p.id} aria-pressed={isChecked} onClick={() => toggleProductFilter(p.id)} className={`px-2.5 py-1 rounded-lg font-medium transition-all flex items-center gap-1.5 ${isChecked ? "bg-slate-100 text-slate-800 border border-slate-200" : "bg-white text-slate-500 border border-slate-200 opacity-60"}`}>
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }}></span>
                <span>{p.name}</span>
              </button>;
	})}
          </div>
          {!filteredProducts.length && <p role="status">No products match your search.</p>}
        </div>}

      {	/* Main Chart Canvas */}
      <div className="h-72 sm:h-80 w-full pt-2">
        <ResponsiveContainer width="100%" height="100%">
          {chartMode === "financials" ? <AreaChart data={data} margin={{
		top: 10,
		right: 10,
		left: 0,
		bottom: 0
	}}>
              <defs>
                <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#5185C5" stopOpacity={.2} />
                  <stop offset="95%" stopColor="#5185C5" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorCost" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#D5A34B" stopOpacity={.14} />
                  <stop offset="95%" stopColor="#D5A34B" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#46A28F" stopOpacity={.2} />
                  <stop offset="95%" stopColor="#46A28F" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#dfe7e2" vertical={false} />
              <XAxis dataKey="label" stroke="#65776d" fontSize={11} tickLine={false} axisLine={{ stroke: "#dfe7e2" }} />
              <YAxis stroke="#65776d" fontSize={11} tickLine={false} axisLine={false} tickFormatter={formatCompactPrice} width={isMobile ? 'auto' : 95} tickMargin={isMobile ? 4 : 8} />
              <Tooltip contentStyle={{
		backgroundColor: "#ffffff",
		borderColor: "#dfe7e2",
		borderRadius: "12px",
		boxShadow: "0 8px 24px rgba(24, 57, 40, 0.07)",
		fontSize: "12px"
	}} formatter={(value, name) => [formatCurrency(Number(value)), name === "revenue" ? "Sales Revenue" : name === "cost" ? "Total Cost" : "Result After Expenses"]} />
              <Legend verticalAlign="top" align="right" wrapperStyle={{
		paddingBottom: "10px",
		fontSize: "12px"
	}} formatter={(value) => value === "revenue" ? "Sales Revenue" : value === "cost" ? "Total Cost" : "Result After Expenses"} />
              {showRevenue && <Area type="monotone" dataKey="revenue" stroke="#5185C5" strokeWidth={2.5} fillOpacity={1} fill="url(#colorRevenue)" />}
              {showCost && <Area type="monotone" dataKey="cost" stroke="#D5A34B" strokeWidth={2.5} fillOpacity={1} fill="url(#colorCost)" />}
              {showProfit && <Area type="monotone" dataKey="profit" stroke="#46A28F" strokeWidth={2.5} fillOpacity={1} fill="url(#colorProfit)" />}
            </AreaChart> : chartMode === "units" ? <LineChart data={data} margin={{
		top: 10,
		right: 10,
		left: 0,
		bottom: 0
	}}>
              <CartesianGrid strokeDasharray="3 3" stroke="#dfe7e2" vertical={false} />
              <XAxis dataKey="label" stroke="#65776d" fontSize={11} tickLine={false} axisLine={{ stroke: "#dfe7e2" }} />
              <YAxis stroke="#65776d" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(val) => `${val}`} width={isMobile ? 'auto' : 60} tickMargin={isMobile ? 4 : 8} />
              <Tooltip contentStyle={{
		backgroundColor: "#ffffff",
		borderColor: "#dfe7e2",
		borderRadius: "12px",
		boxShadow: "0 8px 24px rgba(24, 57, 40, 0.07)",
		fontSize: "12px"
	}} formatter={(value) => [formatNumber(Number(value)), "Total Units Sold"]} />
              <Line type="monotone" dataKey="units" stroke="#9278BD" strokeWidth={3} dot={{
		fill: "#9278BD",
		r: 3
	}} activeDot={{ r: 6 }} />
            </LineChart> : <LineChart data={data} margin={{
		top: 10,
		right: 10,
		left: 0,
		bottom: 0
	}}>
              <CartesianGrid strokeDasharray="3 3" stroke="#dfe7e2" vertical={false} />
              <XAxis dataKey="label" stroke="#65776d" fontSize={11} tickLine={false} axisLine={{ stroke: "#dfe7e2" }} />
              <YAxis stroke="#65776d" fontSize={11} tickLine={false} axisLine={false} tickFormatter={formatCompactPrice} width={isMobile ? 'auto' : 95} tickMargin={isMobile ? 4 : 8} />
              <Tooltip contentStyle={{
		backgroundColor: "#ffffff",
		borderColor: "#dfe7e2",
		borderRadius: "12px",
		boxShadow: "0 8px 24px rgba(24, 57, 40, 0.07)",
		fontSize: "12px"
	}} formatter={(value, name) => {
		const prod = products.find((p) => p.id === name);
		return [formatCurrency(Number(value)), prod ? prod.name : name];
	}} />
              <Legend verticalAlign="top" align="right" wrapperStyle={{
		paddingBottom: "10px",
		fontSize: "11px"
	}} formatter={(value) => {
		const prod = products.find((p) => p.id === value);
		return prod ? prod.name : value;
	}} />
              {products.map((p, idx) => selectedProductIds.includes(p.id) && <Line key={p.id} type="monotone" dataKey={p.id} stroke={PRODUCT_COLORS[idx % PRODUCT_COLORS.length]} strokeWidth={2} dot={false} />)}
            </LineChart>}
        </ResponsiveContainer>
      </div>
    </div>;
};

