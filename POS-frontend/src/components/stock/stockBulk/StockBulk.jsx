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
            <td>{data.item_name}</td>
            <td>{data.stock}</td>
            <td>{data.supplier_name || "not defined"}</td>
            <td>{data.supplier_contact || "not defined"}</td>
            <td className='add-stock-td'>
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