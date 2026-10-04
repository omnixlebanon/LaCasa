import { useState } from 'react';
import { Search, Plus } from 'lucide-react';
import AddCategoryPopup from './addCategoryPopup/AddCategoryPopup.jsx';
import AddIngredientPopup from './addIngredientPopup/AddIngredientPopup.jsx';

export default function StockToolbar({
    readOnly = false, categories, searchQuery, setSearchQuery,
    stockFilter, setStockFilter, dateFilter, setDateFilter,
    categoryFilter, setCategoryFilter, fetchData,
    searchLabel = 'Search ingredients', filters
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
                        aria-label={searchLabel}
                        placeholder={`${searchLabel}...`}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                <div className="stock-extra-nav">
                    {filters !== undefined ? filters : <div className="searchFilters">
                        <select aria-label="Stock level" value={stockFilter} onChange={(e) => setStockFilter(e.target.value)}>
                            <option value="">All Stock Levels</option>
                            <option value="well">Well Stocked</option>
                            <option value="low">Low Stock</option>
                            <option value="out of stock">Out of Stock</option>
                        </select>
                        <select aria-label="Expiration order" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)}>
                            <option value="">Expiration Date</option>
                            <option value="asc">Ascending Order</option>
                            <option value="desc">Descending Order</option>
                        </select>
                        <select aria-label="Ingredient category" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                            <option value="">All Categories</option>
                            {categories.map((cat, index) => (
                                <option key={index} value={cat.i_category_name}>{cat.i_category_name}</option>
                            ))}
                        </select>
                    </div>}
                    {!readOnly && <div className="stock-nav-action-btns">
                        <button className="add-btn" onClick={() => setIsIngModalOpen(true)}>
                            <Plus size={16} /> Ingredient
                        </button>
                        <button className='manage-categories-btn' onClick={() => setIsCatModalOpen(true)}>
                            <p>Manage Categories</p>
                        </button>
                    </div>}
                </div>
            </div>

            <AddIngredientPopup isOpen={!readOnly && isIngModalOpen} onClose={() => setIsIngModalOpen(false)} categories={categories} onSuccess={fetchData} />
            <AddCategoryPopup isOpen={!readOnly && isCatModalOpen} onClose={() => setIsCatModalOpen(false)} categories={categories} onSuccess={fetchData} />

        </>
    );
}
