import LoadingState from '../../LoadingState.jsx';
import { useState } from 'react';
import StockToolbar from '../StockToolbar.jsx';
import RecipeCard from "../recipeCard/RecipeCard.jsx";

function RecipesLinking({
    loading,
    searchQuery,
    setSearchQuery,
    sortedProducts,
    items,
    categories,
    fetchData
}) {
    const [productCategory, setProductCategory] = useState('');
    const [linkStatus, setLinkStatus] = useState('');
    const productCategories = [...new Set(sortedProducts.map(product => product.product_category).filter(Boolean))];
    const filteredProducts = sortedProducts.filter(product => {
        if (productCategory && product.product_category !== productCategory) return false;
        const linkedItems = typeof product.linked_items === 'string'
            ? JSON.parse(product.linked_items) : (product.linked_items || []);
        const hasRecipe = linkedItems.some(item => item && (item.item_id || item.id));
        return !linkStatus || (linkStatus === 'linked' ? hasRecipe : !hasRecipe);
    });
    return (
        <>
            <StockToolbar
                categories={categories} fetchData={fetchData}
                searchQuery={searchQuery} setSearchQuery={setSearchQuery}
                searchLabel="Search products"
                filters={<div className="searchFilters">
                    <select aria-label="Product category" value={productCategory} onChange={event => setProductCategory(event.target.value)}>
                        <option value="">All Product Categories</option>
                        {[...new Set([...productCategories, productCategory].filter(Boolean))].map(category => (
                            <option key={category} value={category}>{category}</option>
                        ))}
                    </select>
                    <select aria-label="Recipe linking status" value={linkStatus} onChange={event => setLinkStatus(event.target.value)}>
                        <option value="">All Recipes</option>
                        <option value="linked">With Linked Ingredients</option>
                        <option value="unlinked">Without Linked Ingredients</option>
                    </select>
                </div>}
            />
            <div className="linking-area">
                {!loading && (
                    <>
                        {!filteredProducts.length && <p className="no-data">No products match your filters.</p>}
                        {filteredProducts.map((product) => (
                            <RecipeCard 
                                key={product.product_id} 
                                data={product} 
                                ingredients={items} 
                                onRecipeEdit={fetchData} 
                            />
                        ))}
                    </>
                )}
                {loading && (
                    <LoadingState label="Loading recipes..." />
                )}
            </div>
        </>
    );
}

export default RecipesLinking;
