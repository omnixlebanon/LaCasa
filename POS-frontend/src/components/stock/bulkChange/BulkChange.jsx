import StockToolbar from '../StockToolbar.jsx';
import LoadingState from '../../LoadingState.jsx';
import StockBulk from '../stockBulk/StockBulk.jsx';

function BulkChange({
    loading,
    items,
    categories, searchQuery, setSearchQuery,
    stockFilter, setStockFilter, dateFilter, setDateFilter,
    categoryFilter, setCategoryFilter,
    fetchData,
    handleAddBatch
}) {
    return (
        <>
            <StockToolbar
                categories={categories}
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
                        <th>Current Stock</th>
                        <th>Supplier</th>
                        <th>Supplier Contact</th>
                        <th>Add Stock</th>
                    </tr>
                </thead>
                {!loading && (
                    <tbody>
                        {!items.length && <tr><td colSpan={5}>No ingredients match your filters.</td></tr>}
                        {items.map((item) => (
                            <StockBulk 
                                key={item.item_id} 
                                data={item} 
                                onItemEdit={fetchData} 
                                onAddBatch={handleAddBatch} 
                            />
                        ))}
                    </tbody>
                )}
            </table>
            {loading && <LoadingState label="Loading stock batches..." />}
        </div>
        </>
    );
}

export default BulkChange;