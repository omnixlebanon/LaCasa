import { useCurrency } from '../../../global.jsx';
import { DollarSign, TrendingUp, ShoppingBag, Crown, Receipt } from 'lucide-react';
import { formatNumber } from '../utils/analytics';

export const KPICards = ({ totalRevenue, totalCost, totalProfit, profitMargin, totalUnitsSold, avgOrderValue, mostSold, mostProfitable, timeframe, metricView = 'all' }) => {
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
            value: formatCurrency(totalCost),
            description: <>Cost ratio: <strong>{totalRevenue > 0 ? Math.round(totalCost / totalRevenue * 100) : 0}%</strong></>,
            detail: `${formatNumber(totalUnitsSold)} units sold`,
        },
        {
            title: 'Est. Gross Profit', tone: totalProfit < 0 ? 'red' : 'green', icon: TrendingUp, metric: 'profit',
            value: formatCurrency(totalProfit),
            description: <>Profit margin: <strong>{profitMargin}%</strong></>,
            detail: `ROI: ${totalCost > 0 ? Math.round(totalProfit / totalCost * 100) : 0}%`,
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
            description: mostProfitable ? <>Margin: <strong>{mostProfitable.profitMargin}%</strong></> : 'No data for period',
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

