import './StockBulk.css'
import { useState } from 'react';

function StockBulk({ data, onItemEdit, onAddBatch }) {
    const [batchStock, setBatchStock] = useState('')
    const itemId = data.item_id || data.id;

    const handelBatchaddition = (e) => {
        e.preventDefault();
        if (!batchStock || Number(batchStock) <= 0) return;
        if (onAddBatch) onAddBatch(itemId, Number(batchStock));
        setBatchStock('')
    }

    return (
        <tr>
            <td data-label="Ingredient">{data.item_name}</td>
            <td data-label="Stock">{data.stock}</td>
            <td data-label="Supplier">{data.supplier_name || "not defined"}</td>
            <td data-label="Contact">{data.supplier_contact || "not defined"}</td>
            <td data-label='Add stock' className='add-stock-td'>
                <div className='add-stock-container'>
                    <input
                        type="number"
                        placeholder="+"
                        value={batchStock}
                        onChange={(e) => setBatchStock(e.target.value)}
                        min="1"
                        required
                    />
                    <button onClick={handelBatchaddition}>Add</button>
                </div>
            </td>
        </tr>
    )
}

export default StockBulk;