import { useCurrency } from '../../../global.jsx';
import MoneyInput from '../../MoneyInput.jsx';
import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import api from '/src/api.js';

function AddIngredientPopup({ isOpen, onClose, categories, onSuccess }) {
    const { currencyLabel } = useCurrency();
    // Define the initial empty state for adding an ingredient
    const defaultFormValues = {
        stock_name: '',
        stock_category: '',
        stock_uom: '',
        stock_limit: 0,
        stock_cost: 0,
        stock_shelf_life: 0,
        stock_supplier_contact: '',
        stock_supplier: ''
    };

    const [formData, setFormData] = useState(defaultFormValues);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (categories && categories.length > 0 && !formData.stock_category) {
            setFormData(prev => ({ ...prev, stock_category: categories[0].i_category_name }));
        }
    }, [categories, isOpen]);

    if (!isOpen) return null;

    const handleFormInputChange = (e) => {
        const { name, value } = e.target;
        setFormData((prev) => ({
            ...prev,
            [name]: value
        }));
    };

    const handleFormSubmit = async (e) => {
        e.preventDefault();
        try {
            setSubmitting(true);
            
            await api.post('/api/items', formData);

            setFormData(defaultFormValues);
            onSuccess();
            onClose();   
        } catch (error) {
            console.error("Error adding stock item:", error.response?.data?.error || error.message);
            alert(error.response?.data?.error || "Failed to add ingredient. Please try again.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className='editPopup'>
            <form className='editPopup-container' onSubmit={handleFormSubmit}>
                <div className='editPopup-head'>
                    <p>Add New Ingredient</p>
                    <button 
                        type="button" 
                        className='close-btn' 
                        onClick={() => { onClose(); setFormData(defaultFormValues); }}
                        disabled={submitting}
                    >
                        <X />
                    </button>
                </div>
                <div className='input-area'>
                    <p className="stock-edit-hint">New ingredients start with zero stock. Add quantities through batches in Bulk Change.</p>
                    <div className='label-input'>
                        <label htmlFor="stock_name">Ingredient Name</label>
                        <input 
                            type="text" 
                            id='stock_name' 
                            name="stock_name" 
                            required maxLength={30}
                            value={formData.stock_name} 
                            onChange={handleFormInputChange} 
                        />
                    </div>
                    <div className='input-area-2nd-line'>
                        <div className='label-input'>
                            <label htmlFor="stock_category">Category</label>
                            <select 
                                name="stock_category" 
                                id="stock_category" 
                                value={formData.stock_category} 
                                onChange={handleFormInputChange}
                                required
                            >
                                <option value="" disabled>Select a category</option>
                                {categories.map((cat, idx) => (
                                    <option key={idx} value={cat.i_category_name}>
                                        {cat.i_category_name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className='label-input'>
                            <label htmlFor="stock_uom">Unit of Measure</label>
                            <input 
                                type="text" 
                                id='stock_uom' 
                                name="stock_uom" 
                                placeholder="e.g. kg, liters, pcs" required maxLength={30}
                                value={formData.stock_uom} 
                                onChange={handleFormInputChange} 
                            />
                        </div>
                    </div>
                    <div className='input-area-3rd-line'>
                        <div className='label-input'>
                            <label htmlFor="stock_limit">Safety Level</label>
                            <input 
                                type="number" 
                                id='stock_limit' 
                                name="stock_limit" required min="0" step="0.01" max="99999999.99" 
                                value={formData.stock_limit} 
                                onChange={handleFormInputChange} 
                            />
                        </div>
                        <div className='label-input'>
                            <label htmlFor="stock_cost">Unit Cost ({currencyLabel})</label>
                            <MoneyInput 
                                id='stock_cost' 
                                name="stock_cost" required min="0" 
                                step="0.01" 
                                value={formData.stock_cost} 
                                onChange={handleFormInputChange} 
                            />
                        </div>
                    </div>
                    <div className='input-area-4th-line'>
                        <div className='label-input'>
                            <label htmlFor="stock_shelf_life">Shelf Life (days)</label>
                            <input 
                                type="number" min="0" step="1" required 
                                id='stock_shelf_life' 
                                name="stock_shelf_life" 
                                value={formData.stock_shelf_life} 
                                onChange={handleFormInputChange} 
                            />
                        </div>
                        <div className='label-input'>
                            <label htmlFor="stock_supplier">Supplier</label>
                            <input 
                                type="text" 
                                id='stock_supplier' 
                                name='stock_supplier' maxLength={30} 
                                value={formData.stock_supplier} 
                                onChange={handleFormInputChange} 
                            />
                        </div>
                    </div>
                    <div className='label-input'>
                        <label htmlFor="stock_supplier_contact">Supplier Contact</label>
                        <input type="text" id="stock_supplier_contact" name="stock_supplier_contact" maxLength={30} value={formData.stock_supplier_contact} onChange={handleFormInputChange} />
                    </div>
                    <div className='edit-submit-container'>
                        <button type='submit' disabled={submitting}>
                            {submitting ? 'Adding...' : 'Add Ingredient'}
                        </button>
                    </div>
                </div>
            </form>
        </div>
    );
}

export default AddIngredientPopup;