import Expenses from '../expenses/Expenses.jsx';
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
	const [expenses, setExpenses] = useState([]);
	const [lastUpdated, setLastUpdated] = useState(new Date());
	const [loading, setLoading] = useState(true);
	const [refreshing, setRefreshing] = useState(false);
	const [hasLoaded, setHasLoaded] = useState(false);
	const [error, setError] = useState("");
	const [skipped, setSkipped] = useState(0);
	const fetchSales = useCallback(async (signal) => {
		setRefreshing(true);
		try {
			const now = new Date();
            const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
            const through = timeframe === 'custom' && customEndDate ? customEndDate : today;
            const [history, summary, expenseResponse] = await Promise.all([api.get("/api/history", { signal }), api.get("/api/products/summary", { signal }), api.get('/api/expenses', { params: { through }, signal })]);
			if (signal?.aborted) return;
			const data = normalizeSales(history.data, summary.data);
			setProducts(data.products);
			setTransactions(data.transactions);
            setExpenses(expenseResponse.data.map(row => ({ ...row, timestamp: `${row.expense_date}T00:00:00`, totalRevenue: 0, totalCost: Number(row.amount), totalProfit: -Number(row.amount), quantity: 0 })));
			setSkipped(data.skipped);
			setHasLoaded(true);
			setLastUpdated(new Date());
			setError("");
		} catch {
			if (!signal?.aborted) setError("Could not refresh sales. Displayed figures may be out of date.");
		} finally {
			if (!signal?.aborted) { setLoading(false); setRefreshing(false); }
		}
	}, [timeframe, customEndDate]);
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
    const filteredExpenses = useMemo(() => filterTransactionsByTimeframe(expenses, timeframe, lastUpdated, customStartDate || undefined, customEndDate || undefined), [expenses, timeframe, lastUpdated, customStartDate, customEndDate]);
    const businessExpenses = filteredExpenses.reduce((cents, row) => cents + Math.round(row.totalCost * 100), 0) / 100;
    const missingCosts = filteredTransactions.filter(tx => tx.totalCost === null).length;
    const noRecipeCosts = filteredTransactions.filter(tx => tx.costSource === 'no_recipe').length;
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
		return generateLineChartData([...filteredTransactions, ...filteredExpenses], timeframe, products, lastUpdated, customStartDate || undefined, customEndDate || undefined);
	}, [
		filteredTransactions,
        filteredExpenses,
        lastUpdated,
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
			`Profit / expense impact (${currency})`,
			"Timestamp",
			"Sale Channel",
            "Cost status"
		];
		const rows = filteredTransactions.map((tx) => [
			tx.id,
			tx.productName,
			tx.category,
			tx.quantity,
			toDisplayAmount(tx.unitPrice),
			tx.unitCost === null ? '' : toDisplayAmount(tx.unitCost),
			toDisplayAmount(tx.totalRevenue),
			tx.totalCost === null ? '' : toDisplayAmount(tx.totalCost),
			tx.totalProfit === null ? '' : toDisplayAmount(tx.totalProfit),
			formatExportTimestamp(tx.timestamp),
			tx.customerRegion,
            tx.costSource
		]);
        for (const row of filteredExpenses) rows.push([`expense-${row.occurrence_id}`, row.description, row.category, '', '', '', 0, row.totalCost === null ? '' : toDisplayAmount(row.totalCost), toDisplayAmount(-row.totalCost), row.expense_date, 'Business expense', row.recurring ? 'Repeating bill' : 'One-time bill']);
        rows.push(['SUMMARY', 'Totals after business expenses', '', '', '', '', toDisplayAmount(totalRevenue), missingCosts ? '' : toDisplayAmount(totalCost + businessExpenses), missingCosts ? '' : toDisplayAmount(totalProfit - businessExpenses), '', '', missingCosts ? 'Historical order costs unavailable' : 'Complete']);
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
        {missingCosts > 0 && <p role="status" className="text-amber-700">{missingCosts} sold item records have no saved checkout cost. Cost and profit totals are unavailable for this period; current recipe prices are not substituted.</p>}
        {noRecipeCosts > 0 && <p role="status" className="text-amber-700">{noRecipeCosts} sold item records had no recipe at checkout and were saved with zero cost.</p>}
        {skipped > 0 && <p className="text-xs text-amber-700">{skipped} records with missing or invalid sales details were excluded.</p>}
        {timeframe === "custom" && (!customStartDate || !customEndDate || customStartDate > customEndDate) && <p role="status" className="text-amber-700">Select a valid start and end date.</p>}
        {	/* Timeframe & Metric View Selector Controls */}
        <TimeframeSelector selectedTimeframe={timeframe} onSelectTimeframe={setTimeframe} customStartDate={customStartDate} onStartDateChange={setCustomStartDate} customEndDate={customEndDate} onEndDateChange={setCustomEndDate} />

        {	/* Top KPI Metric Cards */}
        <KPICards businessExpenses={businessExpenses} missingCosts={missingCosts} totalRevenue={totalRevenue} totalCost={totalCost} totalProfit={totalProfit} profitMargin={profitMargin} totalUnitsSold={totalUnitsSold} avgOrderValue={avgOrderValue} mostSold={mostSold} mostProfitable={mostProfitable} timeframe={timeframe} metricView={metricView} />

        {	/* Interactive Charts Section (Line Charts + Pie Charts Grid) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {	/* Line & Area Charts */}
          <LineChartsSection missingCosts={missingCosts} key={products.map((p) => p.id).join(",")} data={lineChartData} products={products} timeframe={timeframe} metricView={metricView} onMetricViewChange={setMetricView} />

          {	/* Pie & Donut Charts */}
          <PieChartsSection productMetrics={productMetrics} categorySummaries={categorySummaries} />
        </div>

        <ProductRankingTable metrics={productMetrics} metricView={metricView} />
        <Expenses onChanged={() => fetchSales()} />
      </main>
    </div>;
}



