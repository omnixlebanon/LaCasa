import MoneyInput from '../MoneyInput.jsx';
import './ProductCard.css'
import { Eye, EyeOff, Trash, PenLine, X } from 'lucide-react';
import { useCurrency } from '../../global';
import api from '/src/api.js';
import { useState } from 'react';
import { createPortal } from 'react-dom';
function ProductCard({ data, categories = [], onProductEdit }) {
    const { formatPrice, currencyLabel } = useCurrency()
    const [visibilityBusy, setVisibilityBusy] = useState(false);
    const [visibilityError, setVisibilityError] = useState('');
    const hidden = Number(data.pos_hidden) === 1;
    const categoryHidden = Number(data.category_hidden) === 1;
    const toggleVisibility = async () => {
        if (visibilityBusy) return;
        setVisibilityBusy(true); setVisibilityError('');
        try { await api.patch(`/api/products/${data.product_id}/visibility`, { hidden: !hidden }); await onProductEdit?.(); }
        catch (error) { setVisibilityError(error.response?.data?.error || 'Could not change visibility.'); }
        finally { setVisibilityBusy(false); }
    };
    const [isEditPopupOpen, setIsEditPopupOpen] = useState(false);
    const default_form_values = {
        product_name: data.product_name,
        product_category: data.product_category,
        product_price: data.product_price,
    };
    const [formData, setFormData] = useState(default_form_values);
    const handleFormInputChange = (e) => {
        const { name, value, type } = e.target;
        setFormData((currentFormData) => ({
            ...currentFormData,
            [name]: type === 'number' ? Number(value) : value
        }));
    };
    const handleDelete = async (e) => {
        const isConfirmed = window.confirm("Are you sure you want to delete this?");
        if (isConfirmed) {
            if (e) e.preventDefault();
            try {
                const res = await api.delete(`/api/products/${data.product_id}`);
                if (res.status === 200) {
                    console.log(`product ${data.product_id} deleted successfuly.`);
                    if (onProductEdit) onProductEdit();
                }
            } catch (error) {
                console.error('Error deleting ingredient:', error.response?.data?.error || error.message);
            }
        }
    }
    const handleEdit = async (e) => {
        if (e) e.preventDefault();
        try {
            const res = await api.patch(
                `/api/products/${data.product_id}`,
                formData
            );
            if (res.status === 200) {
                setIsEditPopupOpen(false);
                if (onProductEdit) await onProductEdit();
            }
        } catch (error) {
            console.error('Error while editing product:', error.response?.data?.error || error.message);
        }
    }


    return (
        <>
            {isEditPopupOpen && createPortal(
                <div className='editPopup'>
                    <form className='editPopup-container' onSubmit={handleEdit}>
                        <div className='editPopup-head'>
                            <p>Edit Product Info</p>
                            <button type="button" className='close-btn' onClick={() => { setIsEditPopupOpen(false); setFormData(default_form_values) }}>
                                <X />
                            </button>
                        </div>
                        <div className='input-area'>
                            <div className='label-input'>
                                <label htmlFor="product_name">Product Name</label>
                                <input type="text" id='product_name' name="product_name" required value={formData.product_name} onChange={handleFormInputChange} />
                            </div>
                            <div className='input-area-2nd-line'>
                                <div className='label-input'>
                                    <label htmlFor="product_category">Category</label>
                                    <select name="product_category" id="product_category" value={formData.product_category} onChange={handleFormInputChange}>
                                        {categories.map((cat, index) => (
                                            <option key={index} value={cat}>{cat}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className='label-input'>
                                    <label htmlFor="product_price">Product Price ({currencyLabel})</label>
                                    <MoneyInput id='product_price' name="product_price" step="0.01" value={formData.product_price} onChange={handleFormInputChange} />
                                </div>
                            </div>
                            <div className='input-area-3rd-line'>
                            </div>
                            <div className='input-area-4th-line'>
                            </div>
                            <div className='edit-submit-container'><button type='submit'>Save Changes</button></div>
                        </div>
                    </form>
                </div>, document.body
            )}

            <div className={`product-card${hidden || categoryHidden ? ' product-pos-hidden' : ''}`}>
                <p className="product-visibility-status">{hidden ? 'Hidden from POS' : categoryHidden ? 'Hidden by category' : 'Visible in POS'}</p>
                {visibilityError && <p role="alert">{visibilityError}</p>}
                <div className='product-card-head'>
                    <h3>{data.product_name}</h3>
                    <span className='product-category'>{data.product_category}</span>
                </div>
                <div className='product-card-body'>
                    <span className='product-price' >{formatPrice(data.product_price)}</span>
                    <div className='action-btns-container'>
                        <button type="button" className="product-visibility-toggle" disabled={visibilityBusy} onClick={toggleVisibility} aria-label={`${hidden ? 'Show' : 'Hide'} ${data.product_name} ${hidden ? 'in' : 'from'} POS`} title={categoryHidden ? 'The category is hidden; showing this product will not override the category.' : undefined}>
                            {hidden ? <Eye size={18} /> : <EyeOff size={18} />}{visibilityBusy ? 'Saving...' : hidden ? 'Show in POS' : 'Hide from POS'}
                        </button>
                        <button className='edit-btn action-btn' onClick={() => setIsEditPopupOpen(true)}><PenLine /></button>
                        <button className='delete-btn action-btn' onClick={handleDelete}><Trash /></button>
                    </div>
                </div>
            </div>
        </>
    )
}
export default ProductCard;
