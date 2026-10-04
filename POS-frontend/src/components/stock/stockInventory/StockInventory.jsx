import StockToolbar from '../StockToolbar.jsx';
import LoadingState from '../../LoadingState.jsx';
import StockItem from '../stockItem/StockItem.jsx';

function StockInventory({
    readOnly = false,
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

    return (
        <>
            <StockToolbar
                readOnly={readOnly} categories={categories}
                searchQuery={searchQuery} setSearchQuery={setSearchQuery}
                stockFilter={stockFilter} setStockFilter={setStockFilter}
                dateFilter={dateFilter} setDateFilter={setDateFilter}
                categoryFilter={categoryFilter} setCategoryFilter={setCategoryFilter}
                fetchData={fetchData}
            />

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
                            {!readOnly && <th>Actions</th>}
                        </tr>
                    </thead>
                    {!loading && (
                        <tbody>
                            {!sortedItems.length && <tr><td colSpan={readOnly ? 6 : 7}>No ingredients match your filters.</td></tr>}
                            {sortedItems.map((item) => (
                                <StockItem readOnly={readOnly} key={item.item_id} data={item} categories={categories} onItemEdit={fetchData} />
                            ))}
                        </tbody>
                    )}
                </table>
                {loading && <LoadingState label="Loading ingredients..." />}
            </div>
        </>
    );
}

export default StockInventory;