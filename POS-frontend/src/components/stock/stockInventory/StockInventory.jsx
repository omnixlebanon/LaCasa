import { useState } from 'react';
import { Search, LoaderCircle, Plus } from 'lucide-react';
import StockItem from '../stockItem/StockItem.jsx';
import AddCategoryPopup from '../addCategoryPopup/AddCategoryPopup.jsx';
import AddIngredientPopup from '../addIngredientPopup/AddIngredientPopup.jsx';

function StockInventory({
    loading,
    categories,
    sortedItems,
    searchQuery,
    setSearchQuery,
    stockFilter,
    setStockFilter,
    dateFilter,
    setDateFilter,
    categoryFilter,
    setCategoryFilter,
    fetchData
}) {
    const [isIngModalOpen, setIsIngModalOpen] = useState(false);
    const [isCatModalOpen, setIsCatModalOpen] = useState(false);

    return (
        <>
            <div className='stock-search-nav'>
                <div className='searchbar'>
                    <Search />
                    <input
                        type="text"
                        placeholder='Search...'
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                <div className="stock-extra-nav">
                    <div className="searchFilters">
                        <select value={stockFilter} onChange={(e) => setStockFilter(e.target.value)}>
                            <option value="">All Stock Levels</option>
                            <option value="well">Well Stocked</option>
                            <option value="low">Low Stock</option>
                            <option value="out of stock">Out of Stock</option>
                        </select>
                        <select value={dateFilter} onChange={(e) => setDateFilter(e.target.value)}>
                            <option value="">Expiration Date</option>
                            <option value="asc">Ascending Order</option>
                            <option value="desc">Descending Order</option>
                        </select>
                        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                            <option value="">All Categories</option>
                            {categories.map((cat, index) => (
                                <option key={index} value={cat.i_category_name}>{cat.i_category_name}</option>
                            ))}
                        </select>
                    </div>
                    <div className="stock-nav-action-btns">
                        <button className="add-btn" onClick={() => setIsIngModalOpen(true)}>
                            <Plus size={16} /> Ingredient
                        </button>
                        <button className='manage-categories-btn' onClick={() => setIsCatModalOpen(true)}>
                            <p>Manage Categories</p>
                        </button>
                    </div>
                </div>
            </div>

            <AddIngredientPopup isOpen={isIngModalOpen} onClose={() => setIsIngModalOpen(false)} categories={categories} onSuccess={fetchData} />
            <AddCategoryPopup isOpen={isCatModalOpen} onClose={() => setIsCatModalOpen(false)} categories={categories} onSuccess={fetchData} />

            <div className='stock-display-area'>
                <table border="1">
                    <thead>
                        <tr>
                            <th>Ingredient</th>
                            <th>Category</th>
                            <th>Current Stock</th>
                            <th>Safety Limit</th>
                            <th>Unit Cost</th>
                            <th>Expiration</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    {!loading && (
                        <tbody>
                            {sortedItems.map((item) => (
                                <StockItem key={item.item_id} data={item} categories={categories} onItemEdit={fetchData} />
                            ))}
                        </tbody>
                    )}
                </table>
                {loading && <LoaderCircle className="loading" />}
            </div>
        </>
    );
}

export default StockInventory;