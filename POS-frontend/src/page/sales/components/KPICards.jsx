import {Link} from 'react-router-dom';
import { useCurrency } from '../../../global.jsx';
import { DollarSign, TrendingUp, ShoppingBag, Crown, Receipt } from 'lucide-react';
import { formatNumber } from '../utils/analytics';

export const KPICards = ({ totalRevenue, totalCost, totalProfit, profitMargin, totalUnitsSold, avgOrderValue, mostSold, mostProfitable, timeframe, metricView = 'all', businessExpenses = 0, payrollCost = 0, missingCosts = 0 }) => {
  const { formatPrice: formatCurrency } = useCurrency();
    const period = { daily: 'Today', monthly: 'This month', yearly: 'This year', 'all-time': 'All time', custom: 'Custom range' }[timeframe];
    const cards = [
        {
            title: 'Total Sales', tone: 'revenue', icon: DollarSign, metric: 'sales',
            value: formatCurrency(totalRevenue),
            description: <>Average order: <strong className="sales-value-revenue">{formatCurrency(avgOrderValue)}</strong></>,
            detail: period,
        },
        {
            title: 'Total Cost', tone: 'cost', icon: Receipt, metric: 'cost',
            value: missingCosts ? 'Unavailable' : formatCurrency(totalCost + businessExpenses + payrollCost),
            description: <>Cost ratio: <strong>{missingCosts ? 'Unavailable' : `${totalRevenue > 0 ? Math.round((totalCost + businessExpenses + payrollCost) / totalRevenue * 100) : 0}%`}</strong></>,
            detail: 'Order costs + business expenses + paid payroll',
        },
        {
            title: 'Est. Gross Profit', tone: totalProfit < 0 ? 'red' : 'green', icon: TrendingUp,
            value: missingCosts ? 'Unavailable' : formatCurrency(totalProfit),
            description: <>Profit margin: <strong>{missingCosts ? 'Unavailable' : `${profitMargin}%`}</strong></>,
            detail: missingCosts ? 'Historical costs missing' : `ROI: ${totalCost > 0 ? Math.round(totalProfit / totalCost * 100) : 0}%`,
        },
        { title: 'Saved Order Costs', tone: 'cost', icon: Receipt, value: missingCosts ? 'Unavailable' : formatCurrency(totalCost), description: 'Ingredient costs saved at checkout', detail: `${formatNumber(totalUnitsSold)} units sold` },
        { title: 'Payroll Paid', tone: 'cost', icon: Receipt, value: formatCurrency(payrollCost), description: 'Recorded salary payments in this period', detail: 'Counted when marked paid' },
        { title: 'Total Expenses', tone: 'yellow', icon: Receipt, value: formatCurrency(businessExpenses + payrollCost), description: 'Business expenses and paid payroll', detail: period },
        { title: 'Result After Expenses', metric: 'profit', tone: totalProfit - businessExpenses - payrollCost < 0 ? 'red' : 'green', icon: TrendingUp, value: missingCosts ? 'Unavailable' : formatCurrency(totalProfit - businessExpenses - payrollCost), description: 'Sales minus order costs, business expenses and paid payroll', detail: 'Payroll counted on its payment date' },
        {
            title: 'Most Sold Product', tone: 'yellow', icon: ShoppingBag,
            value: mostSold ? `${formatNumber(mostSold.unitsSold)} units` : '—',
            product: mostSold?.product.name,
            description: mostSold ? <>Revenue: <strong className="sales-value-revenue">{formatCurrency(mostSold.totalRevenue)}</strong></> : 'No data for period',
            detail: mostSold ? `${mostSold.percentageOfTotalSales}% share · SKU ${mostSold.product.sku}` : '',
        },
        {
            title: 'Most Profitable', tone: 'green', icon: Crown,
            value: mostProfitable ? formatCurrency(mostProfitable.totalProfit) : '—',
            product: mostProfitable?.product.name,
            description: mostProfitable ? <>Margin: <strong>{mostProfitable.profitMargin}%</strong></> : missingCosts ? 'Historical checkout costs are missing' : 'No data for period',
            detail: mostProfitable ? `${formatNumber(mostProfitable.unitsSold)} units · ${mostProfitable.percentageOfTotalProfit}% profit share` : '',
        },
    ];

    return <div className="sales-kpi-grid">
        {cards.map(({ title, tone, icon: Icon, metric, value, product, description, detail }) => (
            <article key={title} className={`sales-alert sales-alert-${tone}${metricView === metric ? ' sales-alert-selected' : ''}`}>
                <p className="sales-alert-type">{title}</p>
                <div className="sales-alert-value-row">
                    <h2 className="sales-alert-value">{value}</h2>
                    <span className="sales-alert-icon"><Icon size={20} aria-hidden="true" /></span>
                </div>
                {product && <p className="sales-alert-product">{product}</p>}
                <p className="sales-alert-description">{description}</p>
                {detail && <p className="sales-alert-detail">{detail}</p>}
                {title === 'Payroll Paid' && <Link to="/employees/payroll" className="sales-expenses-link">Manage payroll</Link>}
                {title === 'Total Expenses' && <a href="#sales-expenses" className="sales-expenses-link">View business expenses</a>}
            </article>
        ))}
    </div>;
};

