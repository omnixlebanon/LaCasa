import useMobile from '../../hooks/useMobile.js';
import { useMemo, useState, useEffect } from 'react';
import api from '/src/api.js';
import './Stock.css';
import { useCurrency } from "../../global.jsx";
import { TrendingUp, TriangleAlert, ShieldAlert, ClipboardList, BookOpen, Warehouse, BotMessageSquare } from 'lucide-react';

import StockInventory from '../../components/stock/stockInventory/StockInventory.jsx';
import RecipesLinking from '../../components/stock/recipesLinking/RecipesLinking.jsx';
import BulkChange from '../../components/stock/bulkChange/BulkChange.jsx';
import AIProcessingLogs from '../../components/stock/AIProcessingLogs/AIProcessingLogs.jsx';
import DiscardExpiredStock from '../../components/stock/DiscardExpiredStock.jsx';

function Stock() {
    const isMobile = useMobile();
    const [categories, setCategories] = useState([]);
    const [items, setItems] = useState([]);
    const [productSummary, setProductSummary] = useState([]);
    const [recipe, setRecipe] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [dateFilter, setDateFilter] = useState("");
    const [stockFilter, setStockFilter] = useState("");
    const [categoryFilter, setCategoryFilter] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    const { formatPrice } = useCurrency();

    const [stockSummary, setStockSummary] = useState({
        totalStockValue: 0,
        expiredItemsCount: 0,
        needsRefillCount: 0
    });

    const fetchData = async () => {
        try {
            setLoading(true);
            const [categories_res, items_res, summary_res, product_summary_res, recipe_res] = await Promise.all([
                api.get("/api/stock/categories"),
                api.get("/api/items"),
                api.get("/api/stock/summary"),
                api.get("/api/products/summary"),
                api.get("/api/stock/recipe")
            ]);
            setCategories(categories_res.data);
            setItems(items_res.data);
            setStockSummary(summary_res.data);
            setProductSummary(product_summary_res.data);
            setRecipe(recipe_res.data);
            setError(null);
        } catch (error) {
            console.error("Error fetching data from server: ", error);
            setError("Failed to load inventory data");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { 
        fetchData(); 
    }, []);

    const sortedItems = useMemo(() => {
        let result = [...items];

        if (searchQuery.trim() !== "") {
            const term = searchQuery.toLowerCase();
            result = result.filter(item => {
                return (item.item_name || item.name)?.toLowerCase().includes(term);
            });
        }

        if (categoryFilter && categoryFilter !== "") {
            result = result.filter(item => {
                return (item.item_category || item.category)?.toLowerCase() === categoryFilter.toLowerCase();
            });
        }

        if (stockFilter && stockFilter !== "") {
            result = result.filter(item => item.stockStatus?.toLowerCase() === stockFilter.toLowerCase());
        }

        if (dateFilter) {
            result.sort((a, b) => {
                if (!a.exDate) return 1;
                if (!b.exDate) return -1;
                return dateFilter === "asc"
                    ? a.exDate.localeCompare(b.exDate)
                    : b.exDate.localeCompare(a.exDate);
            });
        }
        return result;
    }, [items, searchQuery, categoryFilter, dateFilter, stockFilter]);

    const sortedProducts = useMemo(() => {
        let result = [...productSummary];
        if (searchQuery.trim() !== "") {
            const term = searchQuery.toLowerCase();
            result = result.filter(product => {
                return product.product_name?.toLowerCase().includes(term);
            });
        }
        return result;
    }, [productSummary, searchQuery]);

    const handleAddBatch = async (itemId, stockQuantity) => {
        try {
            const response = await api.post(`/api/stock/${itemId}/batch`, {
                batch_stock: stockQuantity
            });
            console.log("Batch added:", response.data.message);
            fetchData();
        } catch (error) {
            console.error("Error submitting batch addition:", error.response?.data?.error || error.message);
        }
    };

    const [activeID, setActiveID] = useState("btn1");
    const buttons = [
        { id: 'btn1', label: 'Stock Inventory', icon: <ClipboardList /> },
        { id: 'btn2', label: 'Recipes Linking', icon: <BookOpen /> },
        { id: 'btn3', label: 'Bulk Change', icon: <Warehouse /> },
        { id: 'btn4', label: 'AI Processing Logs', icon: <BotMessageSquare /> }
    ];

    return (
        <div>
            <div className="main-area">
                {error && <div className="error-message">{error}</div>}
                <div className="head-area">
                    <h2 className="PageName">Inventory Stock</h2>
                </div>
                <div className='stockAlerts'>
                    <div className='alert valueAlert'>
                        <p className='alert-type'>Stock Valuation</p>
                        <div className='alert-nb-with-icon '>
                            <h2 className='nb-alert-items'>{formatPrice(stockSummary.totalStockValue || 0)}</h2>
                            <TrendingUp className='green-alert' />
                        </div>
                        <p className='alert-desc'>approximate value of inventory</p>
                    </div>
                    <div className='alert expiryAlert'>
                        <p className='alert-type'>Expiration Alert</p>
                        <div className='alert-nb-with-icon '>
                            <h2 className='nb-alert-items'>{stockSummary.expiredItemsCount}</h2>
                            <ShieldAlert className='red-alert' />
                        </div>
                        <p className='alert-desc'>Items near or past expiry</p>
                        {!isMobile && <DiscardExpiredStock onRemoved={fetchData} />}
                    </div>
                    <div className='alert lowStockAlert'>
                        <p className='alert-type'>Low Stock Alert</p>
                        <div className='alert-nb-with-icon'>
                            <h2 className='nb-alert-items'>{stockSummary.needsRefillCount}</h2>
                            <TriangleAlert className=' yellow-alert' />
                        </div>
                        <p className='alert-desc'>Ingredients need stock refill</p>
                    </div>
                </div>
                {!isMobile && <div className="stock-page-nav">
                    {buttons.map((btn) => (
                        <button 
                            key={btn.id} 
                            className={activeID === btn.id ? 'active' : ''}
                            onClick={() => setActiveID(btn.id)}
                        >
                            {btn.icon}{btn.label}
                        </button>
                    ))}
                </div>}

                {(isMobile || activeID === "btn1") && (
                    <StockInventory readOnly={isMobile}
                        loading={loading}
                        categories={categories}
                        sortedItems={sortedItems}
                        searchQuery={searchQuery}
                        setSearchQuery={setSearchQuery}
                        stockFilter={stockFilter}
                        setStockFilter={setStockFilter}
                        dateFilter={dateFilter}
                        setDateFilter={setDateFilter}
                        categoryFilter={categoryFilter}
                        setCategoryFilter={setCategoryFilter}
                        fetchData={fetchData}
                    />
                )}

                {!isMobile && activeID === "btn2" && (
                    <RecipesLinking 
                        loading={loading}
                        searchQuery={searchQuery}
                        setSearchQuery={setSearchQuery}
                        sortedProducts={sortedProducts}
                        items={items}
                        fetchData={fetchData}
                    />
                )}

                {!isMobile && activeID === "btn3" && (
                    <BulkChange 
                        loading={loading}
                        items={items}
                        fetchData={fetchData}
                        handleAddBatch={handleAddBatch}
                    />
                )}

                {!isMobile && activeID === 'btn4' && (
                    <AIProcessingLogs />
                )}
            </div>
        </div>
    );
}

export default Stock;
