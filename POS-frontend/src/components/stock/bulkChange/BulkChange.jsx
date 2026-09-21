import { LoaderCircle } from 'lucide-react';
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
                    <LoaderCircle className="loading" />
                )}
            </table>
        </div>
    );
}

export default BulkChange;