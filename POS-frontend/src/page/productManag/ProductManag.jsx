import LoadingState from '../../components/LoadingState.jsx';
import { useCurrency } from '../../global.jsx';
import MoneyInput from '../../components/MoneyInput.jsx';
import './ProductManag.css';
import { ClipboardList, Plus, Search, X } from 'lucide-react';
import ProductCard from '../../components/productCard/ProductCard';
import api from '/src/api.js';
import { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';

function ProductManag() {
    const [loadingProducts, setLoadingProducts] = useState(true);
    const [loadingCategories, setLoadingCategories] = useState(true);
    const [productError, setProductError] = useState('');
    const [categoryError, setCategoryError] = useState('');
    const { currencyLabel } = useCurrency();
    const [products, setProducts] = useState([]);
    const [categories, setCategories] = useState([]); // Single source of truth for categories
    const [categoryFilter, setCategoryFilter] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    const [isAddPopupOpen, setIsAddPopupOpen] = useState(false);
    const [isAddCategoryOpen, setIsAddCategoryOpen] = useState(false);

    // Local states for the Category Management popup
    const [tempCategories, setTempCategories] = useState([]);
    const [selectedCatId, setSelectedCatId] = useState("");
    const [editCatName, setEditCatName] = useState("");
    const [newCatName, setNewCatName] = useState("");

    // Fetch products
    const fetchData = async () => {
        setLoadingProducts(true);
        setProductError('');
        try {
            const res = await api.get('/api/products');
            setProducts(res.data);
        } catch (error) {
            console.error("Failed to get products data", error);
            setProductError('Could not load products. Please try again.');
        } finally {
            setLoadingProducts(false);
        }
    };

    // Fetch categories from the database table
    const fetchCategories = async () => {
        setLoadingCategories(true);
        setCategoryError('');
        try {
            const res = await api.get('/api/products/categories');
            // Extract the name values from database query results
            const categoryNames = res.data.map(cat => cat.p_category_name || cat.category_name);
            setCategories(categoryNames);
        } catch (error) {
            console.error("Failed to get categories data", error);
            setCategoryError('Could not load categories. Please try again.');
        } finally {
            setLoadingCategories(false);
        }
    };

    const sortedProducts = useMemo(() => {
        let result = [...products];

        if (searchQuery.trim() !== "") {
            const term = searchQuery.toLowerCase();
            result = result.filter(product => {
                return product.product_name?.toLowerCase().includes(term);
            });
        }

        if (categoryFilter && categoryFilter !== "") {
            result = result.filter(product => {
                return product.product_category?.toLowerCase() === categoryFilter.toLowerCase();
            });
        }
        return result;
    }, [products, searchQuery, categoryFilter]);

    const handleAdd = async (e) => {
        if (e) e.preventDefault();
        const form = e.target;
        const product_name = form.elements.product_name.value;
        const product_category = form.elements.product_category.value;
        const product_price = new FormData(form).get('product_price');

        const payload = {
            product_name: product_name,
            product_category: product_category,
            product_price: Number(product_price)
        };
        try {
            const res = await api.post('/api/products', payload);
            if (res.status === 201) {
                fetchData();
                setIsAddPopupOpen(false);
                form.reset();
            }
        } catch (error) {
            console.error('Error while adding product: ', error.response?.data?.error || error.message);
        }
    };

    // Open category popup and populate with existing categories
    const openCategoryManager = () => {
        const initialTemp = categories.map((cat, index) => ({
            id: index.toString(),
            name: cat,
            originalName: cat,
            isNew: false
        }));
        setTempCategories(initialTemp);
        setSelectedCatId("");
        setEditCatName("");
        setNewCatName("");
        setIsAddCategoryOpen(true);
    };

    const handleSelectCategory = (id) => {
        setSelectedCatId(id);
        const category = tempCategories.find(cat => cat.id === id);
        if (category) {
            setEditCatName(category.name);
        } else {
            setEditCatName("");
        }
    };

    // Temporary Add
    const handleAddTempCategory = () => {
        if (!newCatName.trim()) return;

        const newId = `new-${Date.now()}`;
        const updatedTemp = [
            ...tempCategories,
            {
                id: newId,
                name: newCatName.trim(),
                originalName: null,
                isNew: true
            }
        ];
        setTempCategories(updatedTemp);
        setNewCatName("");
    };

    // Temporary Edit/Rename
    const handleRenameTempCategory = () => {
        if (!selectedCatId || !editCatName.trim()) return;

        setTempCategories(prev =>
            prev.map(cat => (cat.id === selectedCatId ? { ...cat, name: editCatName.trim() } : cat))
        );
    };

    const handleDeleteTempCategory = () => {
        const isConfirmed = window.confirm("Are you sure you want to delete this?");
        if (isConfirmed) {
        if (!selectedCatId) return;

        setTempCategories(prev => prev.filter(cat => cat.id !== selectedCatId));
        setSelectedCatId("");
        setEditCatName("");
        }
    };
    
    const handleSaveCategoryChanges = async () => {
        const added = tempCategories.filter(cat => cat.isNew);
        const deleted = categories.filter(origName => !tempCategories.some(cat => cat.originalName === origName));
        const renamed = tempCategories.filter(cat => !cat.isNew && cat.originalName && cat.name !== cat.originalName);

        try {
            for (const cat of added) {
                await api.post('/api/products/category', { category_name: cat.name });
            }

            // 2. Process Renames
            for (const cat of renamed) {
                await api.put('/api/products/category', { old_name: cat.originalName, new_name: cat.name });
            }

            // 3. Process Deletions
            for (const catName of deleted) {
                await api.delete(`/api/products/category/${encodeURIComponent(catName)}`);
            }

            // Refresh data sets from backend
            await fetchCategories();
            await fetchData();
            setIsAddCategoryOpen(false);
        } catch (error) {
            console.error('Error saving category changes: ', error.response?.data?.error || error.message);
        }
    };

    useEffect(() => {
        fetchData();
        fetchCategories();
    }, []);

    if (loadingProducts || loadingCategories || productError || categoryError) return <LoadingState page label="Loading products and categories..." error={loadingProducts || loadingCategories ? null : productError || categoryError} onRetry={() => { fetchData(); fetchCategories(); }} />;

    return (
        <>
            {/* ADD PRODUCT POPUP */}
            {isAddPopupOpen && createPortal(
                <div className='editPopup'>
                    <form className='editPopup-container' onSubmit={handleAdd}>
                        <div className='editPopup-head'>
                            <p>Add Product Info</p>
                            <button type="button" className='close-btn' onClick={() => setIsAddPopupOpen(false)}>
                                <X />
                            </button>
                        </div>
                        <div className='input-area'>
                            <div className='label-input'>
                                <label htmlFor="product_name">Product Name</label>
                                <input type="text" id='product_name' name="product_name" required />
                            </div>
                            <div className='input-area-2nd-line'>
                                <div className='label-input'>
                                    <label htmlFor="product_category">Category</label>
                                    <select name="product_category" id="product_category">
                                        <option value="">-- Select Category --</option>
                                        {categories.map((cat, index) => (
                                            <option key={index} value={cat}>{cat}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className='label-input'>
                                    <label htmlFor="product_price">Product Price ({currencyLabel})</label>
                                    <MoneyInput id='product_price' name="product_price" min="0" step="0.01" />
                                </div>
                            </div>
                            <div className='edit-submit-container'>
                                <button type='submit'>Save Changes</button>
                            </div>
                        </div>
                    </form>
                </div>, document.body
            )}

            {/* MANAGE CATEGORY POPUP */}
            {isAddCategoryOpen && createPortal(
                <div className='editPopup'>
                    <div className='editPopup-container'>
                        <div className='editPopup-head'>
                            <p>Manage Categories</p>
                            <button type="button" className='close-btn' onClick={() => setIsAddCategoryOpen(false)}>
                                <X />
                            </button>
                        </div>

                        <div className='input-area'>
                            <div className='label-input'>
                                <label htmlFor="new_category_input">Add New Category</label>
                                <div className='add-category-area'>
                                    <input type="text" id='new_category_input' value={newCatName} placeholder="Category name..."
                                        onChange={(e) => setNewCatName(e.target.value)}
                                    />
                                    <button className='add-btn' type="button" onClick={handleAddTempCategory}>Add</button>
                                </div>
                            </div>
                            <div className='label-input'>
                                <label htmlFor="select_category">Select Category to Edit/Delete</label>
                                <div className='select-category'>
                                    <select id='select_category' value={selectedCatId} 
                                    onChange={(e) => handleSelectCategory(e.target.value)}
                                    >
                                        <option value="">Choose Category</option>
                                        {tempCategories.map((cat) => (
                                            <option key={cat.id} value={cat.id}>
                                                {cat.name} {cat.isNew ? '(New)' : ''}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                            </div>

                            {selectedCatId && (
                                <div className='label-input'>
                                    <label htmlFor="edit_category_name">Edit Selected Name</label>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <input type="text" id='edit_category_name' value={editCatName}
                                            onChange={(e) => setEditCatName(e.target.value)}
                                        />
                                        <button className='edit-button' type="button" onClick={handleRenameTempCategory}>Rename</button>
                                        <button className='delete-button' type="button" onClick={handleDeleteTempCategory}>Delete</button>
                                    </div>
                                </div>
                            )}

                            <div className='edit-submit-container'>
                                <button className='save-btn' type='button' onClick={handleSaveCategoryChanges}>
                                    Save Changes
                                </button>
                            </div>
                        </div>
                    </div>
                </div>, document.body
            )}

            <div className='main-area'>
                <div className='head-area'>
                    <div className="PageTitle">
                        <ClipboardList />
                        <h2>Product Management</h2>
                    </div>
                </div>

                <div className="search-nav">
                    <div className="searchbar">
                        <Search />
                        <input type="text" placeholder="Search..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                    </div>
                    <div className="searchFilters">
                        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                            <option value="">All Categories</option>
                            {categories.map((category, index) => (
                                <option key={index} value={category}>{category}</option>
                            ))}
                        </select>
                    </div>
                    <div className='addition-btns'>
                        <button className='manage-categories-btn' onClick={openCategoryManager}>
                            <p>Manage Categories</p>
                        </button>
                        <button className='add-btn' onClick={() => setIsAddPopupOpen(true)}>
                            <Plus /><p>Add Product</p>
                        </button>
                    </div>
                </div>

                <div className='display-area'>
                    {sortedProducts.map((product) => (
                        <ProductCard key={product.product_id} data={product} categories={categories} onProductEdit={fetchData} />
                    ))}
                </div>
            </div>
        </>
    );
}

export default ProductManag;
