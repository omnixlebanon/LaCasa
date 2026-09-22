import LoadingState from '../../components/LoadingState.jsx';
import { useCurrency } from '../../global.jsx';
import React, { useState, useEffect, useMemo, useCallback } from "react";
import api from "../../api.js";
import "./Sales.css";
import { normalizeSales, formatExportTimestamp } from "./utils/analytics";
import { filterTransactionsByTimeframe, getProductMetrics, generateLineChartData, getCategorySummaries } from "./utils/analytics";
import { Navbar } from "./components/Navbar";
import { TimeframeSelector } from "./components/TimeframeSelector";
import { KPICards } from "./components/KPICards";
import { LineChartsSection } from "./components/LineChartsSection";
import { PieChartsSection } from "./components/PieChartsSection";
import { ProductRankingTable } from "./components/ProductRankingTable";
export default function Sales() {
  const { currency, toDisplayAmount } = useCurrency();
	const [timeframe, setTimeframe] = useState("daily");
	const [metricView, setMetricView] = useState("all");
	const [customStartDate, setCustomStartDate] = useState("");
	const [customEndDate, setCustomEndDate] = useState("");
	const [products, setProducts] = useState([]);
	const [transactions, setTransactions] = useState([]);
	const [lastUpdated, setLastUpdated] = useState(new Date());
	const [loading, setLoading] = useState(true);
	const [refreshing, setRefreshing] = useState(false);
	const [hasLoaded, setHasLoaded] = useState(false);
	const [error, setError] = useState("");
	const [skipped, setSkipped] = useState(0);
	const fetchSales = useCallback(async (signal) => {
		setRefreshing(true);
		try {
			const [history, summary] = await Promise.all([api.get("/api/history", { signal }), api.get("/api/products/summary", { signal })]);
			if (signal?.aborted) return;
			const data = normalizeSales(history.data, summary.data);
			setProducts(data.products);
			setTransactions(data.transactions);
			setSkipped(data.skipped);
			setHasLoaded(true);
			setLastUpdated(new Date());
			setError("");
		} catch {
			if (!signal?.aborted) setError("Could not refresh sales. Displayed figures may be out of date.");
		} finally {
			if (!signal?.aborted) { setLoading(false); setRefreshing(false); }
		}
	}, []);
	useEffect(() => {
		const controller = new AbortController();
		let timer;
		const refresh = async () => {
			await fetchSales(controller.signal);
			if (!controller.signal.aborted) timer = setTimeout(refresh, 15e3);
		};
		refresh();
		return () => {
			controller.abort();
			clearTimeout(timer);
		};
	}, [fetchSales]);
	// Filtered Transactions for Active Timeframe & Date Range
	const filteredTransactions = useMemo(() => {
		return filterTransactionsByTimeframe(transactions, timeframe, lastUpdated, customStartDate || undefined, customEndDate || undefined);
	}, [
		transactions,
		timeframe,
		customStartDate,
		customEndDate,
		lastUpdated
	]);
	// Product Metrics (Most Sold, Most Profitable)
	const productMetrics = useMemo(() => {
		return getProductMetrics(products, filteredTransactions);
	}, [products, filteredTransactions]);
	// Aggregate Figures
	const totalRevenue = useMemo(() => filteredTransactions.reduce((acc, curr) => acc + curr.totalRevenue, 0), [filteredTransactions]);
	const totalCost = useMemo(() => filteredTransactions.reduce((acc, curr) => acc + curr.totalCost, 0), [filteredTransactions]);
	const totalProfit = useMemo(() => filteredTransactions.reduce((acc, curr) => acc + curr.totalProfit, 0), [filteredTransactions]);
	const totalUnitsSold = useMemo(() => filteredTransactions.reduce((acc, curr) => acc + curr.quantity, 0), [filteredTransactions]);
	const profitMargin = useMemo(() => {
		return totalRevenue > 0 ? Math.round(totalProfit / totalRevenue * 1e3) / 10 : 0;
	}, [totalRevenue, totalProfit]);
	const avgOrderValue = useMemo(() => {
		return filteredTransactions.length > 0 ? totalRevenue / new Set(filteredTransactions.map((tx) => tx.orderId)).size : 0;
	}, [totalRevenue, filteredTransactions]);
	const mostSold = useMemo(() => productMetrics.find((m) => m.isMostSold) || null, [productMetrics]);
	const mostProfitable = useMemo(() => productMetrics.find((m) => m.isMostProfitable) || null, [productMetrics]);
	// Line Chart Data
	const lineChartData = useMemo(() => {
		return generateLineChartData(filteredTransactions, timeframe, products, undefined, customStartDate || undefined, customEndDate || undefined);
	}, [
		filteredTransactions,
		timeframe,
		products,
		customStartDate,
		customEndDate
	]);
	// Category Summaries for Pie Charts
	const categorySummaries = useMemo(() => {
		return getCategorySummaries(filteredTransactions);
	}, [filteredTransactions]);
	// CSV Export
	const handleExportCSV = () => {
		const headers = [
			"Transaction ID",
			"Product Name",
			"Category",
			"Quantity",
			`Unit Price (${currency})`,
			`Unit Cost (${currency})`,
			`Total Revenue (${currency})`,
			`Cost (${currency})`,
			`Gross Profit (${currency})`,
			"Timestamp",
			"Sale Channel"
		];
		const rows = filteredTransactions.map((tx) => [
			tx.id,
			tx.productName,
			tx.category,
			tx.quantity,
			toDisplayAmount(tx.unitPrice),
			toDisplayAmount(tx.unitCost),
			toDisplayAmount(tx.totalRevenue),
			toDisplayAmount(tx.totalCost),
			toDisplayAmount(tx.totalProfit),
			formatExportTimestamp(tx.timestamp),
			tx.customerRegion
		]);
		const escape = (value) => "\"" + String(value).replace(/^[=+@-]/, "'$&").replaceAll("\"", "\"\"") + "\"";
		const csv = [headers, ...rows].map((row) => row.map(escape).join(",")).join("\r\n");
		const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
		const link = document.createElement("a");
		link.href = url;
		link.download = "sales_" + timeframe + ".csv";
		link.click();
		setTimeout(() => URL.revokeObjectURL(url), 1e3);
	};
	if (!hasLoaded) return <LoadingState page label="Loading sales..." error={loading || refreshing ? null : error} onRetry={() => fetchSales()} />;
	return <div id="sales-dashboard" className="min-h-screen bg-slate-50 text-slate-800 font-sans antialiased pb-12">
      {	/* Header Navbar */}
      <Navbar onExportCSV={handleExportCSV} lastUpdated={lastUpdated} />

      {	/* Main Body */}
      <main className="space-y-6">
        {refreshing && <LoadingState label="Refreshing sales..." />}
        {error && <div role="alert" className="text-rose-700">{error} <button onClick={() => fetchSales()} className="underline">Retry</button></div>}
        {skipped > 0 && <p className="text-xs text-amber-700">{skipped} records with missing or invalid sales details were excluded.</p>}
        {timeframe === "custom" && (!customStartDate || !customEndDate || customStartDate > customEndDate) && <p role="status" className="text-amber-700">Select a valid start and end date.</p>}
        {	/* Timeframe & Metric View Selector Controls */}
        <TimeframeSelector selectedTimeframe={timeframe} onSelectTimeframe={setTimeframe} customStartDate={customStartDate} onStartDateChange={setCustomStartDate} customEndDate={customEndDate} onEndDateChange={setCustomEndDate} />

        {	/* Top KPI Metric Cards */}
        <KPICards totalRevenue={totalRevenue} totalCost={totalCost} totalProfit={totalProfit} profitMargin={profitMargin} totalUnitsSold={totalUnitsSold} avgOrderValue={avgOrderValue} mostSold={mostSold} mostProfitable={mostProfitable} timeframe={timeframe} metricView={metricView} />

        {	/* Interactive Charts Section (Line Charts + Pie Charts Grid) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {	/* Line & Area Charts */}
          <LineChartsSection key={products.map((p) => p.id).join(",")} data={lineChartData} products={products} timeframe={timeframe} metricView={metricView} onMetricViewChange={setMetricView} />

          {	/* Pie & Donut Charts */}
          <PieChartsSection productMetrics={productMetrics} categorySummaries={categorySummaries} />
        </div>

        <ProductRankingTable metrics={productMetrics} metricView={metricView} />
      </main>
    </div>;
}



