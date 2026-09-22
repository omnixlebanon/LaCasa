import LoadingState from '../../LoadingState.jsx';
import StockBulk from '../stockBulk/StockBulk.jsx';

function BulkChange({
    loading,
    items,
    fetchData,
    handleAddBatch
}) {
    return (
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
                {loading && (
                    <LoadingState label="Loading stock batches..." />
                )}
            </table>
        </div>
    );
}

export default BulkChange;