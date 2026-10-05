import { useCurrency } from '../../../global.jsx';
import { DollarSign, TrendingUp, ShoppingBag, Crown, Receipt } from 'lucide-react';
import { formatNumber } from '../utils/analytics';

export const KPICards = ({ totalRevenue, totalCost, totalUnitsSold, avgOrderValue, mostSold, mostProfitable, timeframe, metricView = 'all', businessExpenses = 0, payrollCost = 0, missingCosts = 0 }) => {
  const { formatPrice: formatCurrency } = useCurrency();
    const allCosts = totalCost + businessExpenses + payrollCost;
    const netProfit = totalRevenue - allCosts;
    const netMargin = totalRevenue > 0 ? Math.round(netProfit / totalRevenue * 1000) / 10 : 0;
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
            value: missingCosts ? 'Unavailable' : formatCurrency(allCosts),
            description: <>Cost ratio: <strong>{missingCosts ? 'Unavailable' : `${totalRevenue > 0 ? Math.round(allCosts / totalRevenue * 100) : 0}%`}</strong></>,
            detail: 'Order costs + business expenses + paid payroll',
        },
        {
            title: 'Est. Net Profit', tone: netProfit < 0 ? 'red' : 'green', icon: TrendingUp,
            value: missingCosts ? 'Unavailable' : formatCurrency(netProfit),
            description: <>Profit margin: <strong>{missingCosts ? 'Unavailable' : `${netMargin}%`}</strong></>,
            detail: missingCosts ? 'Historical costs missing' : `After ingredients, expenses and paid salaries · ROI: ${allCosts > 0 ? Math.round(netProfit / allCosts * 100) : 0}%`,
        },
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
            </article>
        ))}
    </div>;
};

