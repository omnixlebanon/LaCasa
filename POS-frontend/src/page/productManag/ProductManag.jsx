import StructurePopup from "../../components/StructurePopup.jsx";
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
    const [saveError, setSaveError] = useState('');
    const [savingProduct,setSavingProduct]=useState(false);
    const [saveMessage,setSaveMessage]=useState('');
    const [categoryError, setCategoryError] = useState('');
    const { currencyLabel } = useCurrency();
    const [products, setProducts] = useState([]);
    const [categoryRecords, setCategoryRecords] = useState([]);
    const [visibilityBusy, setVisibilityBusy] = useState(null);
    const [visibilityError, setVisibilityError] = useState('');
    const [visibilityFilter, setVisibilityFilter] = useState('');
    const [categories, setCategories] = useState([]); // Single source of truth for categories
    const [categoryFilter, setCategoryFilter] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    const [isAddPopupOpen, setIsAddPopupOpen] = useState(false);
    const [structurePopup,setStructurePopup]=useState(null);

    // Local states for the Category Management popup

    const toggleCategoryVisibility = async category => {
        if (visibilityBusy !== null) return;
        setVisibilityBusy(category.p_category_id); setVisibilityError('');
        try {
            await api.patch(`/api/products/categories/${category.p_category_id}/visibility`, { hidden: Number(category.pos_hidden) !== 1 });
            await Promise.all([fetchData(), fetchCategories()]);
        } catch (error) { setVisibilityError(error.response?.data?.error || 'Could not change category visibility.'); }
        finally { setVisibilityBusy(null); }
    };

    // Fetch products
    const fetchData = async (quiet = false) => {
        if (quiet !== true) setLoadingProducts(true);
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
    const fetchCategories = async (quiet = false) => {
        if (quiet !== true) setLoadingCategories(true);
        setCategoryError('');
        try {
            const res = await api.get('/api/products/categories');
            // Extract the name values from database query results
            const categoryNames = res.data.map(cat => cat.p_category_name || cat.category_name);
            setCategories(categoryNames);
            setCategoryRecords(res.data);
        } catch (error) {
            console.error("Failed to get categories data", error);
            setCategoryError('Could not load categories. Please try again.');
        } finally {
            setLoadingCategories(false);
        }
    };

    useEffect(() => {
        fetchData();
        fetchCategories();
        const refresh = () => {
            fetchData(true);
            fetchCategories(true);
        };
        window.addEventListener('offline-snapshot', refresh);
        return () => window.removeEventListener('offline-snapshot', refresh);
    }, []);

    const sortedProducts = useMemo(() => {
        let result = [...products];
        if (visibilityFilter) result = result.filter(product => (Number(product.pos_hidden) === 1 || Number(product.category_hidden) === 1) === (visibilityFilter === 'hidden'));

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
    }, [products, searchQuery, categoryFilter, visibilityFilter]);

    const handleAdd = async (e) => {
        if (e) e.preventDefault();
        if(savingProduct)return;
        setSaveError('');setSaveMessage('');
        const form = e.target;
        const product_name = form.elements.product_name.value.trim();
        const product_category = form.elements.product_category.value;
        const product_price = new FormData(form).get('product_price');

        const payload = {
            product_name: product_name,
            product_category: product_category,
            product_price: Number(product_price),
            product_description: form.elements.product_description.value,
            product_image: form.elements.product_image.value
        };
        if(!product_name||!product_category||product_price===''||!Number.isFinite(Number(product_price))||Number(product_price)<0){setSaveError('Enter a product name, select a category, and enter a valid price.');return;}
        setSavingProduct(true);
        try {
            const res = await api.post('/api/products', payload);
            if (res.status === 201) {
                setSearchQuery('');setCategoryFilter('');setVisibilityFilter('');
                await fetchData();
                setSaveMessage('Saved '+product_name+' on this device. Check Sync for the server result.');
                setIsAddPopupOpen(false);
                form.reset();
            }
        } catch (error) {
            setSaveError(error.response?.data?.error || 'Could not save product. Please try again.');
        } finally {setSavingProduct(false);}
    };

    const openCategoryManager=()=>setStructurePopup('categories');

    return (
        <>
            {/* ADD PRODUCT POPUP */}
            {saveMessage&&<p role="status">{saveMessage}</p>}
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
                            {saveError && <p role="alert" className="error-message">{saveError}</p>}
                            <div className='label-input'>
                                <label htmlFor="product_name">Product Name</label>
                                <input type="text" id='product_name' name="product_name" required />
                            </div>
                            <div className='input-area-2nd-line'>
                                <div className='label-input'>
                                    <label htmlFor="product_category">Category</label>
                                    <select name="product_category" id="product_category" required>
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
                            <div className='label-input'><label htmlFor="product_description">Menu description</label><textarea id="product_description" name="product_description" maxLength={2000}  /></div>
                            <div className='label-input'><label htmlFor="product_image">Menu image URL</label><input id="product_image" name="product_image" maxLength={255} placeholder="https://... or imgs/items/photo.png"  /></div>
                            <div className='edit-submit-container'>
                                <button type='submit' disabled={savingProduct}>{savingProduct?'Saving...':'Save Changes'}</button>
                            </div>
                        </div>
                    </form>
                </div>, document.body
            )}

            {structurePopup&&<StructurePopup kind={structurePopup} onClose={()=>setStructurePopup(null)} onChanged={async()=>{await fetchCategories();await fetchData();}}/>}

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
                        <select aria-label="POS visibility" value={visibilityFilter} onChange={event => setVisibilityFilter(event.target.value)}><option value="">All visibility</option><option value="visible">Visible in POS & menu</option><option value="hidden">Hidden from POS & menu</option></select>
                        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                            <option value="">All Categories</option>
                            {categories.map((category, index) => (
                                <option key={index} value={category}>{category}</option>
                            ))}
                        </select>
                    </div>
                    <div className='addition-btns'>
                        <button type="button" className="manage-categories-btn" onClick={()=>setStructurePopup('groups')}>Manage Groups</button>
                        <button className='manage-categories-btn' onClick={openCategoryManager}>
                            <p>Manage Categories</p>
                        </button>
                        <button className='add-btn' onClick={() => setIsAddPopupOpen(true)}>
                            <Plus /><p>Add Product</p>
                        </button>
                    </div>
                </div>

                <section className="category-visibility-panel" aria-label="Category POS and menu visibility">
                    <h3>Categories in POS & menu</h3><p>Hiding a category hides all its products. Showing it again keeps individually hidden products hidden.</p>
                    {visibilityError && <p role="alert">{visibilityError}</p>}
                    {(loadingCategories || categoryError) && <LoadingState label="Loading categories..." error={categoryError} onRetry={() => fetchCategories()} />}
                    <div>{categoryRecords.map(category => <button type="button" key={category.p_category_id} disabled={visibilityBusy !== null} onClick={() => toggleCategoryVisibility(category)} aria-pressed={Number(category.pos_hidden) !== 1}>
                        <strong>{category.p_category_name}</strong><span>{visibilityBusy === category.p_category_id ? 'Saving...' : Number(category.pos_hidden) === 1 ? 'Hidden - show in POS' : 'Visible - hide from POS'}</span>
                    </button>)}</div>
                </section>
                {(loadingProducts || productError) && <LoadingState label="Loading products..." error={productError} onRetry={() => fetchData()} />}
                {!loadingProducts && !productError && !sortedProducts.length && <p className="product-empty">No products match your filters.</p>}
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
