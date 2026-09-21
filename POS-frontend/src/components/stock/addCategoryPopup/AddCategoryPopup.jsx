import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import api from '/src/api.js';

function AddCategoryPopup({ isOpen, onClose, categories, onSuccess }) {
    const [tempCategories, setTempCategories] = useState([]);
    const [newCatName, setNewCatName] = useState('');
    const [selectedCatId, setSelectedCatId] = useState('');
    const [editCatName, setEditCatName] = useState('');
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (isOpen && categories) {
            setTempCategories(
                categories.map((cat, idx) => ({
                    id: cat.i_category_id || cat.id || `existing-${idx}`,
                    name: cat.i_category_name,
                    isNew: false,
                    isEdited: false,
                    isDeleted: false
                }))
            );
        }
        // Reset selections
        setSelectedCatId('');
        setEditCatName('');
        setNewCatName('');
    }, [isOpen, categories]);

    if (!isOpen) return null;

    // Stage adding a new category locally
    const handleAddTempCategory = () => {
        if (!newCatName.trim()) return;

        const isDuplicate = tempCategories.some(
            (cat) => cat.name.toLowerCase() === newCatName.trim().toLowerCase() && !cat.isDeleted
        );
        if (isDuplicate) {
            alert("Category already exists.");
            return;
        }

        const newTempItem = {
            id: `temp-${Date.now()}`, // unique temporary ID
            name: newCatName.trim(),
            isNew: true,
            isEdited: false,
            isDeleted: false
        };

        setTempCategories((prev) => [...prev, newTempItem]);
        setNewCatName('');
    };

    // Handle selecting a category from the dropdown
    const handleSelectCategory = (id) => {
        setSelectedCatId(id);
        const selected = tempCategories.find((cat) => cat.id === id);
        if (selected) {
            setEditCatName(selected.name);
        } else {
            setEditCatName('');
        }
    };

    // Stage renaming a category locally
    const handleRenameTempCategory = () => {
        if (!selectedCatId || !editCatName.trim()) return;

        setTempCategories((prev) =>
            prev.map((cat) => {
                if (cat.id === selectedCatId) {
                    return { ...cat, name: editCatName.trim(), isEdited: true };
                }
                return cat;
            })
        );
    };

    // Stage deleting a category locally
    const handleDeleteTempCategory = () => {
        if (!selectedCatId) return;

        setTempCategories((prev) => {
            // If the category was brand new and not yet saved to DB, remove it entirely.
            // Otherwise, mark it as isDeleted to process on the server later.
            return prev
                .map((cat) => {
                    if (cat.id === selectedCatId) {
                        return { ...cat, isDeleted: true };
                    }
                    return cat;
                })
                .filter((cat) => !(cat.isNew && cat.isDeleted));
        });

        // Reset editing selections
        setSelectedCatId('');
        setEditCatName('');
    };

    // Send final updates to the backend API on save
    const handleSaveCategoryChanges = async () => {
        try {
            setSubmitting(true);

            // Separate staged categories by operation
            const toCreate = tempCategories.filter((cat) => cat.isNew);
            const toUpdate = tempCategories.filter((cat) => !cat.isNew && cat.isEdited && !cat.isDeleted);
            const toDelete = tempCategories.filter((cat) => !cat.isNew && cat.isDeleted);

            // Run API calls in parallel
            await Promise.all([
                // 1. Process Creates
                ...toCreate.map((cat) => 
                    api.post('/api/stock/categories', { i_category_name: cat.name })
                ),

                // 2. Process Updates (adjust PUT endpoint pattern matching your API)
                ...toUpdate.map((cat) => 
                    api.put(`/api/stock/categories/${cat.id}`, { i_category_name: cat.name })
                ),

                // 3. Process Deletes (adjust DELETE endpoint pattern matching your API)
                ...toDelete.map((cat) => 
                    api.delete(`/api/stock/categories/${cat.id}`)
                )
            ]);

            onSuccess(); // Refresh categories in main panel
            onClose();   // Close modal
        } catch (error) {
            console.error("Error saving category changes:", error.response?.data?.error || error.message);
            alert("Failed to save category changes.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className='editPopup'>
            <div className='editPopup-container'>
                <div className='editPopup-head'>
                    <p>Manage Categories</p>
                    <button 
                        type="button" 
                        className='close-btn' 
                        onClick={onClose} 
                        disabled={submitting}
                    >
                        <X />
                    </button>
                </div>

                <div className='input-area'>
                    <div className='label-input'>
                        <label htmlFor="new_category_input">Add New Category</label>
                        <div className='add-category-area'>
                            <input 
                                type="text" 
                                id='new_category_input' 
                                value={newCatName} 
                                placeholder="Category name..."
                                onChange={(e) => setNewCatName(e.target.value)}
                                disabled={submitting}
                            />
                            <button 
                                className='add-btn' 
                                type="button" 
                                onClick={handleAddTempCategory}
                                disabled={submitting}
                            >
                                Add
                            </button>
                        </div>
                    </div>
                    <div className='label-input'>
                        <label htmlFor="select_category">Select Category to Edit/Delete</label>
                        <div className='select-category'>
                            <select 
                                id='select_category' 
                                value={selectedCatId} 
                                onChange={(e) => handleSelectCategory(e.target.value)}
                                disabled={submitting}
                            >
                                <option value="">Choose Category</option>
                                {tempCategories
                                    .filter((cat) => !cat.isDeleted) // Don't show staged deletions
                                    .map((cat) => (
                                        <option key={cat.id} value={cat.id}>
                                            {cat.name} {cat.isNew ? '(New)' : ''}
                                        </option>
                                    ))
                                }
                            </select>
                        </div>
                    </div>

                    {selectedCatId && (
                        <div className='label-input'>
                            <label htmlFor="edit_category_name">Edit Selected Name</label>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <input 
                                    type="text" 
                                    id='edit_category_name' 
                                    value={editCatName}
                                    onChange={(e) => setEditCatName(e.target.value)}
                                    disabled={submitting}
                                />
                                <button 
                                    className='edit-button' 
                                    type="button" 
                                    onClick={handleRenameTempCategory}
                                    disabled={submitting}
                                >
                                    Rename
                                </button>
                                <button 
                                    className='delete-button' 
                                    type="button" 
                                    onClick={handleDeleteTempCategory}
                                    disabled={submitting}
                                >
                                    Delete
                                </button>
                            </div>
                        </div>
                    )}

                    <div className='edit-submit-container'>
                        <button 
                            className='save-btn' 
                            type='button' 
                            onClick={handleSaveCategoryChanges}
                            disabled={submitting}
                        >
                            {submitting ? 'Saving...' : 'Save Changes'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default AddCategoryPopup;