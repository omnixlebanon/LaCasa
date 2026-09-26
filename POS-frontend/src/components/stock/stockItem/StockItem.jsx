import UnitInput from '../UnitInput.jsx';
import MoneyInput from '../../MoneyInput.jsx';
import './StockItem.css'
import { expirationStatus } from './expiration.js';
import { PenLine, Trash, X } from 'lucide-react';
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import api from '/src/api.js';
import { useCurrency } from '../../../global';

function StockItem({ data, onItemEdit, categories = [], readOnly = false }) {
    // Standardizing values with default fallbacks matching the MySQL schema
    const itemId = data.item_id || data.id;
    const itemName = data.item_name || data.name || '';
    const itemCategory = data.item_category || data.category || '';
    const safetyLimit = data.safety_limit !== undefined ? data.safety_limit : (data.limit || 0);
    const itemCost = data.item_cost !== undefined ? data.item_cost : (data.cost || 0);

    const difference_stock_limit = data.stock - safetyLimit;

    const default_form_values = {
        stock_name: itemName,
        stock_category: itemCategory,
        stock_uom: data.uom || '',
        stock_limit: safetyLimit,
        stock_cost: itemCost,
        stock_shelf_life: data.shelf_life ?? 0,
        stock_supplier: data.supplier_name || '',
        stock_supplier_contact: data.supplier_contact || '',
    };

    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState('');
    const [isEditPopupOpen, setIsEditPopupOpen] = useState(false);
    const [formData, setFormData] = useState(default_form_values);
    const { formatPrice, currencyLabel } = useCurrency();

    useEffect(() => {
        setFormData({
            stock_name: itemName,
            stock_category: itemCategory,
            stock_uom: data.uom || '',
                stock_limit: safetyLimit,
            stock_cost: itemCost,
                stock_shelf_life: data.shelf_life ?? 0,
            stock_supplier: data.supplier_name || '',
            stock_supplier_contact: data.supplier_contact || '',
        });
    }, [data, itemName, itemCategory, safetyLimit, itemCost]);

    let refill_level = "good_stock";
    if (data.stock === 0) {
        refill_level = "danger_stock";
    } else if (difference_stock_limit <= 0) {
        refill_level = "bad_stock";
    }

    const expiration = expirationStatus(data.exDate);
    const expirationLabel = expiration.date
        ? new Date(`${expiration.date}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
        : '';

    const handleFormInputChange = (e) => {
        const { name, value, type } = e.target;
        setFormData({
            ...formData,
            [name]: type === 'number' ? Number(value) : value
        });
    };

    const handleFormSubmit = async event => {
        event.preventDefault();
        if (saving) return;
        setSaving(true); setSaveError('');
        try {
            await api.patch(`/api/stock/${itemId}/edit`, formData);
            setIsEditPopupOpen(false);
            await onItemEdit?.();
        } catch (error) {
            setSaveError(error.response?.data?.error || 'Could not save ingredient details. Please try again.');
        } finally { setSaving(false); }
    };

    const handleDelete = async (e) => {
        const isConfirmed = window.confirm("Are you sure you want to delete this?");
        if (isConfirmed) {
            if (e) e.preventDefault();
            try {
                const res = await api.delete(`/api/stock/${itemId}/delete`);
                console.log("Success:", res.data.message);
                if (onItemEdit) onItemEdit();
            } catch (error) {
                console.log("Error while deleting the item", error);
            }
        }
    };

    return (
        <>
            {!readOnly && isEditPopupOpen && createPortal(
                <div className='editPopup'>
                    <form className='editPopup-container' onSubmit={handleFormSubmit}>
                        <div className='editPopup-head'>
                            <p>Edit Stock Info</p>
                            <button type="button" className='close-btn' disabled={saving} aria-label='Close stock editor' onClick={() => { setIsEditPopupOpen(false); setFormData(default_form_values) }}>
                                <X />
                            </button>
                        </div>
                        <fieldset className='input-area stock-edit-fields' disabled={saving}>
                            {saveError && <p className="stock-edit-error" role="alert">{saveError}</p>}
                            <p className="stock-edit-hint">Add quantities in Bulk Change using Add Stock. Expiration follows the remaining batches.</p>
                            <div className='input-area-2nd-line'>
                                <div className='label-input'><label htmlFor="stock_item_id">Ingredient ID</label><input id="stock_item_id" value={itemId} readOnly /></div>
                                <div className='label-input'><label htmlFor="stock_status">Stock status</label><input id="stock_status" value={data.stockStatus || (Number(data.stock) <= 0 ? 'out of stock' : Number(data.stock) > Number(safetyLimit) ? 'well' : 'Low')} readOnly /></div>
                            </div>
                            <div className='label-input'><label htmlFor="stock_name">Ingredient Name</label><input type="text" id="stock_name" name="stock_name" required maxLength={30} value={formData.stock_name} onChange={handleFormInputChange} /></div>
                            <div className='input-area-2nd-line'>
                                <div className='label-input'><label htmlFor="stock_category">Category</label><select id="stock_category" name="stock_category" value={formData.stock_category} onChange={handleFormInputChange}>
                                    <option value="">No category</option>
                                    {formData.stock_category && !categories.some(cat => cat.i_category_name === formData.stock_category) && <option value={formData.stock_category}>{formData.stock_category}</option>}
                                    {categories.map(cat => <option key={cat.i_category_name} value={cat.i_category_name}>{cat.i_category_name}</option>)}
                                </select></div>
                                <div className='label-input'><label htmlFor="stock_uom">Unit of Measure</label><UnitInput id="stock_uom" name="stock_uom" required maxLength={30} value={formData.stock_uom} onChange={handleFormInputChange} /></div>
                            </div>
                            <div className='input-area-2nd-line'>
                                <div className='label-input'><label htmlFor="stock_limit">Safety Level</label><input type="number" id="stock_limit" name="stock_limit" required min="0" max="99999999.99" step="0.01" value={formData.stock_limit} onChange={handleFormInputChange} /></div>
                                <div className='label-input'><label htmlFor="stock_cost">Unit Cost ({currencyLabel})</label><MoneyInput id="stock_cost" name="stock_cost" required min="0" value={formData.stock_cost} onChange={handleFormInputChange} /></div>
                            </div>
                            <div className='input-area-2nd-line'>
                                <div className='label-input'><label htmlFor="stock_expiration">Current expiration</label><input id="stock_expiration" value={expirationLabel || 'No dated batch'} readOnly /></div>
                                <div className='label-input'><label htmlFor="stock_shelf_life">Shelf Life (days)</label><input type="number" id="stock_shelf_life" name="stock_shelf_life" required min="0" max="2147483647" step="1" value={formData.stock_shelf_life} onChange={handleFormInputChange} /><small>Used for new batches.</small></div>
                            </div>
                            <div className='input-area-2nd-line'>
                                <div className='label-input'><label htmlFor="stock_supplier">Supplier</label><input type="text" id="stock_supplier" name="stock_supplier" maxLength={30} value={formData.stock_supplier} onChange={handleFormInputChange} /></div>
                                <div className='label-input'><label htmlFor="stock_supplier_contact">Supplier Contact</label><input type="text" id="stock_supplier_contact" name="stock_supplier_contact" maxLength={30} value={formData.stock_supplier_contact} onChange={handleFormInputChange} /></div>
                            </div>
                            <div className='edit-submit-container'><button type='submit'>{saving ? 'Saving?' : 'Save Changes'}</button></div>
                        </fieldset>
                    </form>
                </div>, document.body
            )}
            <tr>
                <td data-label="Ingredient">{itemName}</td>
                <td data-label="Category"><div className='category-td-container'><p>{itemCategory}</p></div></td>
                <td data-label="Current stock">
                    <div className='stock-td-container'>
                        <div className='btns-stock'>
                            <p className={refill_level}>{data.stock} {data.uom}</p>
                        </div>
                    </div>
                </td>
                <td data-label="Safety limit">{safetyLimit}{data.uom}</td>
                <td data-label="Unit cost">{formatPrice(itemCost)}</td>
                <td data-label="Expiration"><div className="stock-expiration">
                    <span className={`date-td-container ${expiration.className}`}>
                        {expiration.showDate ? <time dateTime={expiration.date}>{expirationLabel}</time> : expiration.label}
                    </span>
                </div></td>
                {!readOnly && <td data-label="Actions">
                    <div className='stock-action-btn-container'>
                        <button className='edit-btn action-btn' aria-label={`Edit ${itemName}`} onClick={() => { setSaveError(''); setIsEditPopupOpen(true); }}>
                            <PenLine />
                        </button>
                        <button className='delete-btn action-btn' onClick={(e) => handleDelete(e)}><Trash /></button>
                    </div>
                </td>}
            </tr>
        </>
    );
}

export default StockItem;
