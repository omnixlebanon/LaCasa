import LoadingState from '../../components/LoadingState.jsx';
import './Order.css';
import { Search, Plus, Minus, X, Ticket, SlidersHorizontal, CircleCheckBig } from 'lucide-react';
import OrderButton from '../../components/orderButton/OrderButton.jsx';
import OrderOptions from '../../components/orderOptions/OrderOptions.jsx';
import api from '/src/api.js';
import { useCurrency } from '../../global.jsx';
import { useState, useEffect, useMemo, useRef } from 'react';

function Order() {
    const [mobilePanel, setMobilePanel] = useState('products');
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const orderButtonsRef = useRef(null);
    const newlyAddedOrderRef = useRef(null);
    const [products, setProducts] = useState([]);
    const [categories, setCategories] = useState([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [categoryFilter, setCategoryFilter] = useState("");

    const [optionsOpen, setOptionsOpen] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [optionOpen, setOptionOpen] = useState("");
    const { formatPrice, rate } = useCurrency();

    const [orders, setOrders] = useState(() => {
        const savedOrders = localStorage.getItem('pos_orders');
        return savedOrders ? JSON.parse(savedOrders) : [];
    });
    const [nextOrder, setNextOrder] = useState(() => {
        const savedNext = localStorage.getItem('pos_nextOrder');
        return savedNext ? parseInt(savedNext, 10) : 1;
    });
    const [activeOrderId, setActiveOrderId] = useState(() => {
        const savedActiveId = localStorage.getItem('pos_activeOrderId');
        return savedActiveId ? parseInt(savedActiveId, 10) : null;
    });

    useEffect(() => {
        const today = new Date().toISOString().split('T')[0];
        const lastSavedDate = localStorage.getItem('lastActiveDate');

        if (lastSavedDate !== today) {
            setOrders([]);
            localStorage.setItem('pos_orders', JSON.stringify([]));
            setNextOrder(1);
            localStorage.setItem('pos_nextOrder', '1');
            setActiveOrderId(null);
            localStorage.removeItem('pos_activeOrderId');
            localStorage.setItem('lastActiveDate', today);
        }
    }, []);

    useEffect(() => {
        localStorage.setItem('pos_orders', JSON.stringify(orders));
    }, [orders]);

    useEffect(() => {
        localStorage.setItem('pos_nextOrder', nextOrder.toString());
    }, [nextOrder]);

    useEffect(() => {
        if (activeOrderId !== null) {
            localStorage.setItem('pos_activeOrderId', activeOrderId.toString());
        } else {
            localStorage.removeItem('pos_activeOrderId');
        }
    }, [activeOrderId]);

    const fetchData = async () => {
        setLoading(true);
        setLoadError('');
        try {
            const [categories_res, product_res] = await Promise.all([
                api.get('/api/products/categories', { params: { scope: 'pos' } }),
                api.get('/api/products', { params: { scope: 'pos' } })
            ]);
            setCategories(categories_res.data);
            setProducts(product_res.data);
        } catch (error) {
            console.error("Error fetching data from server: ", error);
            setLoadError('Could not load POS products. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const sortedProducts = useMemo(() => {
        let result = [...products];

        if (searchQuery.trim() !== "") {
            const term = searchQuery.toLowerCase();
            result = result.filter(product =>
                product.product_name?.toLowerCase().includes(term)
            );
        }

        if (categoryFilter && categoryFilter !== "") {
            result = result.filter(product =>
                product.product_category?.toLowerCase() === categoryFilter.toLowerCase()
            );
        }
        return result;
    }, [products, searchQuery, categoryFilter]);

    const addOrder = () => {
        const newOrderId = nextOrder;
        newlyAddedOrderRef.current = newOrderId;
        setOrders([
            ...orders,
            {
                id: nextOrder,
                label: `order ${nextOrder}`,
                orderType: 'takeout',
                items: []
            }
        ]);
        setNextOrder(nextOrder + 1);
        setActiveOrderId(newOrderId);
    };

    useEffect(() => {
        if (newlyAddedOrderRef.current !== activeOrderId) return;
        newlyAddedOrderRef.current = null;
        const list = orderButtonsRef.current;
        if (!list) return;
        const addButton = list.querySelector('.new-order-btn');
        if (!addButton) return;
        const listBounds = list.getBoundingClientRect();
        const addBounds = addButton.getBoundingClientRect();
        const bottomPadding = parseFloat(window.getComputedStyle(list).paddingBottom) || 0;
        if (addBounds.bottom + bottomPadding <= listBounds.top + list.clientTop + list.clientHeight) return;
        list.scrollTo({
            top: list.scrollHeight,
            behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
        });
    }, [orders, activeOrderId]);

    const addProductToOrder = (product) => {
        if (!activeOrderId) {
            addOrder();
            return;
        }

        setOrders((prevOrders) =>
            prevOrders.map((order) => {
                if (order.id !== activeOrderId) return order;
                const existingItemIndex = order.items.findIndex(
                    (item) => item.product_id === product.product_id
                );
                let updatedItems = [...order.items];

                if (existingItemIndex > -1) {
                    updatedItems[existingItemIndex] = {
                        ...updatedItems[existingItemIndex],
                        qty: updatedItems[existingItemIndex].qty + 1,
                    };
                } else {
                    updatedItems.push({
                        product_id: product.product_id,
                        product_name: product.product_name,
                        product_price: product.product_price,
                        qty: 1,
                    });
                }
                return { ...order, items: updatedItems };
            })
        );
    };

    const removeProductFromOrder = (product) => {
        setOrders((prevOrders) =>
            prevOrders.map((order) => {
                if (order.id !== activeOrderId) return order;
                const updatedItems = order.items.map((item) =>
                    item.product_id === product.product_id
                        ? { ...item, qty: item.qty - 1 }
                        : item
                )
                    .filter((item) => item.qty > 0);

                return { ...order, items: updatedItems };
            })
        );
    };

    const removeOrder = (idToRemove) => {
        const remainingOrders = orders.filter(order => order.id !== idToRemove);
        setOrders(remainingOrders);
        if (activeOrderId === idToRemove) {
            if (remainingOrders.length > 0) {
                setActiveOrderId(remainingOrders[remainingOrders.length - 1].id);
            } else {
                setActiveOrderId(null);
            }
        }
    };

    const activeOrder = useMemo(() => {
        return orders.find(order => order.id === activeOrderId) || null;
    }, [orders, activeOrderId]);

    const subtotal = useMemo(() => {
        if (!activeOrder) return 0;
        return activeOrder.items.reduce((sum, item) => sum + (item.product_price * item.qty), 0);
    }, [activeOrder]);

    const discountAmount = useMemo(() => {
        if (!activeOrder?.discount) return 0;
        const { type, value } = activeOrder.discount;
        const amount = type === 'percent' ? subtotal * value / 100 : type === 'lbp' ? value / rate : value;
        return Math.min(subtotal, Math.max(0, Number(amount) || 0));
    }, [activeOrder, subtotal, rate]);
    const totalPrice = Math.max(0, subtotal - discountAmount);

    const updateActiveOrder = (changes) => {
        if (!activeOrderId) return;
        setOrders(previous => previous.map(order => order.id === activeOrderId ? { ...order, ...changes } : order));
    };

    const handleActiveOption = (id) => {
        if (!activeOrder) return alert('Select or create an order first.');
        if (id === 'print') updateActiveOrder({ noPrint: !activeOrder.noPrint });
        else if (id === 'dineIn') updateActiveOrder({ orderType: activeOrder.orderType === 'dine-in' ? 'takeout' : 'dine-in' });
        else if (id === 'reset') {
            if (window.confirm('Remove all items and options from this order?')) {
                updateActiveOrder({ items: [], kitchenNote: '', discount: null, noPrint: false });
                setOptionsOpen(false);
            }
        } else setOptionOpen(id);
    };

    const handleSaveChanges = (id, values) => {
        if (id === 'orderName') updateActiveOrder({ label: values.name.trim() });
        if (id === 'kitchenNote') updateActiveOrder({ kitchenNote: values.note.trim() });
        if (id === 'discount') updateActiveOrder({ discount: values.discount });
        setOptionOpen('');
        setOptionsOpen(false);
    };

    const releaseOrderTable = async (order) => {
        if (order.tableId) await api.put(`/api/seating/tables/${order.tableId}/status`, { t_status: 'available' });
        else if (order.tableName || /^T\d+$/i.test(order.label)) {
            await api.put('/api/seating/tables/status', { t_name: order.tableName || order.label, t_status: 'available' });
        }
    };

    const handleCloseOrder = async (idToRemove, event) => {
        event?.stopPropagation();
        const order = orders.find(item => item.id === idToRemove);
        if (!order) return;
        try {
            await releaseOrderTable(order);
            removeOrder(idToRemove);
        } catch (error) {
            alert(error.response?.data?.error || 'Could not release this table.');
        }
    };

    const handleCheckIn = async () => {
        if (isProcessing) return;
        if (!activeOrder || activeOrder.items.length === 0) {
            alert("Cannot check in an empty order.");
            return;
        }
        setIsProcessing(true);

        const payload = {
            totalAmount: parseFloat(totalPrice),
            customerName: activeOrder.label,
            details: {
                order_tab_id: activeOrder.id,
                order_label: activeOrder.label,
                table_id: activeOrder.tableId || null,
                table_name: activeOrder.tableName || (/^T\d+$/i.test(activeOrder.label) ? activeOrder.label : null),
                order_type: activeOrder.orderType || 'takeout',
                kitchen_note: activeOrder.kitchenNote || '',
                no_print: !!activeOrder.noPrint,
                subtotal,
                discount: discountAmount,
                items: activeOrder.items.map(item => ({
                    product_id: item.product_id,
                    product_name: item.product_name,
                    price: item.product_price,
                    qty: item.qty
                }))
            }
        };

        try {
            await api.post('/api/checkout', payload);
            removeOrder(activeOrder.id);

        } catch (error) {
            console.error("Checkout system error:", error);
            const errorMessage = error.response?.data?.error || error.message || "Server transaction failed.";
            alert(`Error: ${errorMessage}`);
        } finally {
            setIsProcessing(false);
        }
    };

    if (loading || loadError) return <LoadingState page label="Loading POS products..." error={loadError} onRetry={fetchData} />;

    return (
        <>
            <OrderOptions
                optionsOpen={optionsOpen}
                setOptionsOpen={setOptionsOpen}
                optionOpen={optionOpen}
                setOptionOpen={setOptionOpen}
                activeOrder={activeOrder}
                handleActiveOption={handleActiveOption}
                handleSaveChanges={handleSaveChanges}
            />
            <div className={`main-order-area mobile-panel-${mobilePanel}`}>
                <div className="mobile-order-tabs" aria-label="Order view">
                    <button aria-pressed={mobilePanel === 'products'} onClick={() => setMobilePanel('products')}>Products</button>
                    <button aria-pressed={mobilePanel === 'cart'} onClick={() => setMobilePanel('cart')}>Cart / {activeOrder?.items?.reduce((sum, item) => sum + item.qty, 0) || 0} / {formatPrice(totalPrice)}</button>
                </div>
                <div className='order-area'>
                    <div className="mobile-order-context">
                        <span>{activeOrder ? `Order: ${activeOrder.label}` : 'Create an order to start adding products'}</span>
                        <button onClick={addOrder}><Plus size={16} /> New order</button>
                    </div>
                    <div className="head-area">
                        <div className='search-nav'>
                            <div className='searchbar'>
                                <Search />
                                <input
                                    type="text"
                                    placeholder='Search...'
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                            </div>
                            <div className="searchButtons">
                                <button
                                    className={`search-button ${categoryFilter === "" ? "active" : ""}`}
                                    onClick={() => setCategoryFilter("")}
                                >
                                    All
                                </button>
                                {categories.map((cat, index) => (
                                    <button
                                        className={`search-button ${categoryFilter.toLowerCase() === cat.p_category_name?.toLowerCase() ? "active" : ""}`}
                                        onClick={() => setCategoryFilter(cat.p_category_name)}
                                        key={index}
                                    >
                                        {cat.p_category_name}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className='display-products-area'>
                        {sortedProducts.map((product) => (
                            <OrderButton
                                key={product.product_id}
                                data={product}
                                onClick={() => addProductToOrder(product)}
                            />
                        ))}
                    </div>
                </div>
                <div className='check-area'>
                    <div className="head-area">
                        <div className="orders" ref={orderButtonsRef}>
                            {orders
                                .filter((order) => order.status !== 'closed')
                                .map((order) => (
                                    <div
                                        key={order.id}
                                        className={`order-btn ${activeOrderId === order.id ? 'active' : ''}`}
                                        onClick={() => setActiveOrderId(order.id)}
                                    >
                                        <button className="close-btn" onClick={(e) => handleCloseOrder(order.id, e)}>
                                            <X />
                                        </button>
                                        <Ticket className="order-icon" />
                                        <span className="order-label">{order.label}</span>
                                    </div>
                                ))}
                            <button className='new-order-btn' onClick={addOrder} aria-label="Create order">
                                <Plus />
                            </button>
                        </div>
                    </div>
                    <div className="order-items-list">
                        {activeOrder && activeOrder.items.length > 0 ? (
                            activeOrder.items.map((item) => (
                                <div key={item.product_id} className="order-item-row">
                                    <div className='item-name-price-area'>
                                        <span className="item-name">{item.product_name}</span>
                                        <span className='item-price'>{formatPrice(item.product_price * item.qty)}</span>
                                    </div>
                                    <span className="qty-control-area">
                                        <button className='decrease-qty' onClick={() => removeProductFromOrder(item)}><Minus /></button>
                                        <span className="item-qty">{item.qty}x</span>
                                        <button className='increase-qty' onClick={() => addProductToOrder(item)}><Plus /></button>
                                    </span>
                                </div>
                            ))
                        ) : (
                            <p className="empty-order-text">
                                {activeOrderId ? "No items in this order" : "Select or create order"}
                            </p>
                        )}
                    </div>
                    <div className="order-bottom-area">
                        <div className='order-total'>
                            {discountAmount > 0 && <span className='order-discount-summary'>Subtotal {formatPrice(subtotal)} · Discount {formatPrice(discountAmount)}</span>}
                            <span className='total-text'>Total</span>
                            <span className='total-price'>{formatPrice(totalPrice)}</span>
                        </div>
                        <div className='order-action-buttons'>
                            <button
                                className='order-options'
                                onClick={() => setOptionsOpen(true)}
                                disabled={isProcessing}
                            >
                                <SlidersHorizontal />
                            </button>
                            <button
                                className='check-in-btn'
                                onClick={handleCheckIn}
                                disabled={isProcessing || !activeOrder || activeOrder.items.length === 0}
                                style={{ opacity: isProcessing ? 0.6 : 1 }}
                            >
                                {isProcessing ? (
                                    <span>Processing...</span>
                                ) : (
                                    <><CircleCheckBig /><span>Check in</span></>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}

export default Order;
