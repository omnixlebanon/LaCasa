import { useCurrency } from '../../../global.jsx';
import { useState } from 'react';
import { Search, ArrowUpDown, ArrowUp, ArrowDown, Award, Crown } from 'lucide-react';
import { formatNumber } from '../utils/analytics';

const columns = [
    ['unitsSold', 'Units sold'],
    ['totalRevenue', 'Sales'],
    ['totalCost', 'Cost'],
    ['totalProfit', 'Est. gross profit'],
    ['profitMargin', 'Margin'],
];

export const ProductRankingTable = ({ metrics }) => {
  const { formatPrice: formatCurrency } = useCurrency();
    const [search, setSearch] = useState('');
    const [category, setCategory] = useState('');
    const [sort, setSort] = useState({ field: 'totalProfit', direction: 'desc' });
    const categories = [...new Set(metrics.map(item => item.product.category))].sort();
    const rows = metrics.filter(item => (
        (!category || item.product.category === category) &&
        `${item.product.name} ${item.product.sku}`.toLowerCase().includes(search.trim().toLowerCase())
    )).sort((a, b) => (
        (sort.direction === 'asc' ? 1 : -1) * (a[sort.field] - b[sort.field]) ||
        a.product.name.localeCompare(b.product.name)
    ));
    const changeSort = field => setSort(previous => ({
        field,
        direction: previous.field === field && previous.direction === 'desc' ? 'asc' : 'desc',
    }));
    const resetFilters = () => { setSearch(''); setCategory(''); };

    return (
        <section className="sales-products" aria-labelledby="sales-products-title">
            <div className="sales-products-header">
                <h2 id="sales-products-title">Product performance</h2>
                <div className="sales-products-controls">
                    <div className="sales-products-search">
                        <Search size={16} aria-hidden="true" />
                        <input aria-label="Search products" type="search" placeholder="Search product or SKU" value={search} onChange={event => setSearch(event.target.value)} />
                    </div>
                    <select aria-label="Filter by category" value={category} onChange={event => setCategory(event.target.value)}>
                        <option value="">All categories</option>
                        {categories.map(value => <option key={value} value={value}>{value}</option>)}
                    </select>
                    {(search || category) && <button className="sales-products-clear" onClick={resetFilters}>Clear filters</button>}
                </div>
            </div>
            <div className="sales-products-scroll" tabIndex={0} role="region" aria-label="Product performance table">
                <table>
                    <thead>
                        <tr>
                            <th scope="col">Product</th>
                            <th scope="col">Unit price</th>
                            {columns.map(([field, label]) => {
                                const active = sort.field === field;
                                const Icon = active ? (sort.direction === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
                                return <th key={field} scope="col" aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
                                    <button className={active ? 'is-sorted' : ''} onClick={() => changeSort(field)}>
                                        {label}<Icon size={13} aria-hidden="true" />
                                    </button>
                                </th>;
                            })}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map(item => <tr key={item.product.id}>
                            <td>
                                <div className="sales-product-name">{item.product.name}</div>
                                <div className="sales-product-meta">{item.product.category}<span aria-hidden="true"> / </span>SKU {item.product.sku}</div>
                                {(item.isMostSold || item.isMostProfitable) && <div className="sales-product-badges">
                                    {item.isMostSold && <span className="sales-badge-volume"><Award size={12} />Most sold</span>}
                                    {item.isMostProfitable && <span className="sales-badge-profit"><Crown size={12} />Most profitable</span>}
                                </div>}
                            </td>
                            <td>{formatCurrency(item.product.unitPrice)}<small>Current catalog price</small></td>
                            <td>{formatNumber(item.unitsSold)}<small>{item.percentageOfTotalSales}% share</small></td>
                            <td className="sales-value-revenue">{formatCurrency(item.totalRevenue)}</td>
                            <td className="sales-value-cost">{item.missingCost ? 'Unavailable' : formatCurrency(item.totalCost)}</td>
                            <td className={item.totalProfit < 0 ? 'sales-value-loss' : 'sales-value-profit'}>{item.missingCost ? 'Unavailable' : formatCurrency(item.totalProfit)}</td>
                            <td>
                                <div className={item.profitMargin < 0 ? 'sales-value-loss' : ''}>{item.missingCost ? 'Unavailable' : `${item.profitMargin}%`}</div>
                                <div className="sales-margin-track" aria-hidden="true" hidden={item.missingCost}><div style={{ width: `${Math.max(0, Math.min(item.profitMargin, 100))}%` }} /></div>
                            </td>
                        </tr>)}
                        {!rows.length && <tr><td colSpan={7} className="sales-products-empty">
                            <Search size={24} aria-hidden="true" />
                            <strong>{metrics.length ? 'No matching products' : 'No product data yet'}</strong>
                            <span>{metrics.length ? 'Try another name or category.' : 'Products will appear here when available.'}</span>
                            {(search || category) && <button onClick={resetFilters}>Clear filters</button>}
                        </td></tr>}
                    </tbody>
                </table>
            </div>
        </section>
    );
};

