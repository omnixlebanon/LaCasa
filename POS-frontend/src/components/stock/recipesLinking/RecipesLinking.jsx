import LoadingState from '../../LoadingState.jsx';
import { Search } from 'lucide-react';
import RecipeCard from "../recipeCard/RecipeCard.jsx";

function RecipesLinking({
    loading,
    searchQuery,
    setSearchQuery,
    sortedProducts,
    items,
    fetchData
}) {
    return (
        <>
            <div className='search-nav'>
                <div className='searchbar'>
                    <Search />
                    <input 
                        type="text" 
                        placeholder='Search...' 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)} 
                    />
                </div>
            </div>
            <div className="linking-area">
                {!loading && (
                    <>
                        {sortedProducts.map((product) => (
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