import ReceiptDialog from '../../components/ReceiptDialog.jsx';
import SplitOrderDialog from '../../components/SplitOrderDialog.jsx';
import { splitOrder } from '../../utils/splitOrder.js';
import { isPrintingDisabled, usePrintingDisabled } from '../../utils/printing.js';
import PreparationDialog from '../../components/PreparationDialog.jsx';
import { lineKey, pendingPreparation, preparationSnapshot } from '../../utils/preparation.js';
import CashPaymentDialog from '../../components/CashPaymentDialog.jsx';
import useDrafts, { editDrafts } from '../../offline/useDrafts.js';
import LoadingState from '../../components/LoadingState.jsx';
import './Order.css';
import { Search, Plus, Minus, X, Ticket, SlidersHorizontal, CircleCheckBig, Printer, SkipForward } from 'lucide-react';
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
    const [printingDisabled, setPrintingDisabled] = usePrintingDisabled();
    const [splitSource, setSplitSource] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [paymentOrder,setPaymentOrder]=useState(null),[paymentError,setPaymentError]=useState('');
    const checkoutLock=useRef(false);
    const [receipt,setReceipt]=useState(null);
    const [preparation, setPreparation] = useState(null);
    const [printChoice, setPrintChoice] = useState(false);
    const printChoiceDialog = useRef(null);
    useEffect(() => {
        if (printChoice) printChoiceDialog.current?.showModal();
    }, [printChoice]);
    const [tables, setTables] = useState([]);
    const [tableBusy, setTableBusy] = useState(false);
    const [tableError, setTableError] = useState('');
    const [optionOpen, setOptionOpen] = useState("");
    const { formatPrice, rate } = useCurrency();

    const { orders, activeOrderId, setOrders, setActiveOrderId, ready: draftsReady } = useDrafts();

    const fetchData = async (quiet = false) => {
        if (quiet !== true) setLoading(true);
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
            setLoadError(error.response?.data?.error || error.message || 'Could not load POS products. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        const refresh = () => fetchData(true);
        window.addEventListener('offline-snapshot', refresh);
        return () => window.removeEventListener('offline-snapshot', refresh);
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

    const addOrder = () => editDrafts(drafts => {
        const label = `order ${drafts.nextOrder++}`;
        const id = crypto.randomUUID();
        newlyAddedOrderRef.current = id;
        drafts.orders.push({ id, checkoutOperationId: id, label, orderType: 'takeout', items: [] });
        drafts.activeOrderId = id;
    }).catch(error => alert('Order was not saved: ' + error.message));

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
                const existingItemIndex = product.lineId ? order.items.findIndex(item => item.lineId === product.lineId) : -1;
                let updatedItems = [...order.items];

                if (existingItemIndex > -1) {
                    updatedItems[existingItemIndex] = {
                        ...updatedItems[existingItemIndex],
                        qty: updatedItems[existingItemIndex].qty + 1,
                    };
                } else {
                    updatedItems.push({
                        lineId: crypto.randomUUID(),
                        product_id: product.product_id,
                        product_name: product.product_name,
                        product_price: product.product_price,
                        product_category: product.product_category,
                        note: '',
                        qty: 1,
                    });
                }
                return { ...order, items: updatedItems };
            })
        );
    };

    const removeProductFromOrder = (product, index) => {
        setOrders((prevOrders) =>
            prevOrders.map((order) => {
                if (order.id !== activeOrderId) return order;
                const updatedItems = order.items.map((item, itemIndex) =>
                    lineKey(item, itemIndex) === lineKey(product, index)
                        ? { ...item, qty: item.qty - 1 }
                        : item
                )
                    .filter((item) => item.qty > 0);

                return { ...order, items: updatedItems };
            })
        );
    };

    const removeOrder = (idToRemove) => editDrafts(drafts => {
        drafts.orders = drafts.orders.filter(order => order.id !== idToRemove);
        if (drafts.activeOrderId === idToRemove) drafts.activeOrderId = drafts.orders.at(-1)?.id || null;
    });

    const activeOrder = useMemo(() => {
        return orders.find(order => order.id === activeOrderId) || null;
    }, [orders, activeOrderId]);

    const preparationItems = (activeOrder?.items || []).map(item => ({ ...item, product_category: item.product_category || products.find(product => product.product_id === item.product_id)?.product_category }));
    const pendingItems = pendingPreparation(preparationItems, activeOrder?.printedPreparation);
    const needsPreparation = !printingDisabled && (!activeOrder?.preparationPrinted || pendingItems.length > 0);
    const preparationLock = useRef(false);
    const startPreparation = async (all = true) => {
        if (isPrintingDisabled()) return;
        if (!activeOrder?.items.length || preparationLock.current) return;
        preparationLock.current = true;
        setIsProcessing(true);
        setPrintChoice(false);
        try {
            let tableName = activeOrder.tableName || '';
            let floorName = '';
            if (activeOrder.tableId || tableName) {
                const response = await api.get('/api/seating/floors');
                const matches = table => activeOrder.tableId ? String(table.t_id) === String(activeOrder.tableId) : table.t_name === tableName;
                const floor = response.data.find(floor => (floor.tables || []).some(matches));
                const table = floor?.tables.find(matches);
                if (!table) throw new Error('The assigned table was not found. Update the table in Order Options before printing.');
                tableName = table.t_name;
                floorName = floor.floor_name;
            }
            setPreparation({ id: activeOrder.id, items: all ? preparationItems : pendingItems, snapshot: preparationSnapshot(activeOrder.items), tableName, floorName });
        } catch (error) {
            alert(error.response?.data?.error || error.message || 'Could not prepare staff slips.');
            closePreparation();
        }
    };
    const closePreparation = () => {
        setPreparation(null);
        preparationLock.current = false;
        setIsProcessing(false);
    };
    const confirmPreparation = async () => {
        await editDrafts(drafts => {
            const order = drafts.orders.find(order => order.id === preparation.id);
            if (!order) throw new Error('This order was closed.');
            order.printedPreparation = preparation.snapshot;
            order.preparationPrinted = true;
        });
        closePreparation();
    };
    const skipPreparation = async () => {
        if (!activeOrder || preparationLock.current) return;
        preparationLock.current = true;
        setIsProcessing(true);
        try {
            await editDrafts(drafts => {
                const order = drafts.orders.find(order => order.id === activeOrder.id);
                if (!order) throw new Error('This order was closed.');
                // Acknowledge this version so checkout can continue; future changes still prompt.
                order.printedPreparation = preparationSnapshot(activeOrder.items);
                order.preparationPrinted = true;
            });
            setPrintChoice(false);
        } catch (error) {
            alert('Could not skip printing: ' + error.message);
        } finally {
            preparationLock.current = false;
            setIsProcessing(false);
        }
    };
    const updateItemNote = (index, note) => setOrders(previous => previous.map(order => order.id === activeOrderId ? {
        ...order, items: order.items.map((item, itemIndex) => itemIndex === index ? { ...item, note } : item)
    } : order));

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
        if (id === 'split') {
            if (activeOrder.items.reduce((sum, item) => sum + item.qty, 0) < 2) return alert('Add at least two items before splitting an order.');
            setSplitSource(structuredClone(activeOrder));
            setOptionsOpen(false);
            return;
        }
        if (id === 'table') {
            setTableError('');
            setOptionOpen('table');
            api.get('/api/seating/floors').then(response => setTables(response.data.flatMap(floor => floor.tables || []))).catch(error => setTableError(error.message || 'Could not load tables.'));
            return;
        }
        if (id === 'print') updateActiveOrder({ noPrint: !activeOrder.noPrint });
        else if (id === 'dineIn') updateActiveOrder({ orderType: activeOrder.orderType === 'dine-in' ? 'takeout' : 'dine-in' });
        else if (id === 'reset') {
            if (window.confirm('Remove all items and options from this order?')) {
                updateActiveOrder({ items: [], kitchenNote: '', discount: null, noPrint: false, printedPreparation: {}, preparationPrinted: false });
                setOptionsOpen(false);
            }
        } else setOptionOpen(id);
    };

    const handleSaveChanges = async (id, values) => {
        if (id === 'table') {
            if (tableBusy) return;
            setTableBusy(true);
            setTableError('');
            try {
                const entered = values.table.trim();
                const name = /^\d+$/.test(entered) ? `T${Number(entered)}` : entered;
                const response = await api.get('/api/seating/floors');
                const table = response.data.flatMap(floor => floor.tables || []).find(table => table.t_name.toLowerCase() === name.toLowerCase());
                if (!table) throw new Error('Table not found. Enter an existing table number or name.');
                const previous = activeOrder;
                await editDrafts(drafts => {
                    const order = drafts.orders.find(order => order.id === previous.id);
                    if (!order) throw new Error('This order was closed.');
                    if (drafts.orders.some(other => other.id !== order.id && String(other.tableId) === String(table.t_id))) throw new Error('This table already has an order. Open it from Tables instead.');
                    order.tableId = table.t_id;
                    order.tableName = table.t_name;
                    order.orderType = 'dine-in';
                });
                await api.put(`/api/seating/tables/${table.t_id}/status`, { t_status: 'occupied' });
                if (previous.tableId && String(previous.tableId) !== String(table.t_id)) await releaseOrderTable(previous);
            } catch (error) {
                setTableError(error.response?.data?.error || error.message || 'Could not save table.');
                return;
            } finally { setTableBusy(false); }
        }
        if (id === 'orderName') updateActiveOrder({ label: values.name.trim() });
        if (id === 'discount') updateActiveOrder({ discount: values.discount });
        setOptionOpen('');
        setOptionsOpen(false);
    };

    const confirmSplit = async (quantities, label) => {
        await editDrafts(drafts => {
            const index = drafts.orders.findIndex(order => order.id === splitSource.id);
            if (index < 0 || JSON.stringify(drafts.orders[index]) !== JSON.stringify(splitSource)) throw new Error('This order changed. Cancel and reopen Split Order.');
            const id = crypto.randomUUID();
            const result = splitOrder(drafts.orders[index], quantities, id, label);
            drafts.orders[index] = result.original;
            drafts.orders.push(result.split);
            drafts.nextOrder++;
            drafts.activeOrderId = id;
            newlyAddedOrderRef.current = id;
        });
        setSplitSource(null);
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
            await removeOrder(idToRemove);
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
        if (needsPreparation) {
            if (activeOrder.preparationPrinted) setPrintChoice(true);
            else startPreparation();
            return;
        }
        const payload = {
            totalAmount: parseFloat(totalPrice),
            customerName: activeOrder.label,
            details: {
                checkout_operation_id: activeOrder.checkoutOperationId,
                order_tab_id: activeOrder.id,
                order_label: activeOrder.label,
                table_id: activeOrder.tableId || null,
                table_name: activeOrder.tableName || (/^T\d+$/i.test(activeOrder.label) ? activeOrder.label : null),
                order_type: activeOrder.orderType || 'takeout',
                kitchen_note: activeOrder.kitchenNote || '',
                no_print: printingDisabled || !!activeOrder.noPrint,
                subtotal,
                discount: discountAmount,
                items: activeOrder.items.map(item => ({
                    product_id: item.product_id,
                    product_name: item.product_name,
                    price: item.product_price,
                    qty: item.qty,
                    note: item.note || '',
                    product_category: item.product_category
                }))
            }
        };

        setPaymentError('');
        setPaymentOrder({payload,order:JSON.stringify(activeOrder),id:activeOrder.id,rate});
    };
    const confirmPayment=async payment=>{
        if(checkoutLock.current||!paymentOrder)return;
        const current=orders.find(order=>order.id===paymentOrder.id);
        if(!current||JSON.stringify(current)!==paymentOrder.order){setPaymentError('This order changed. Cancel and reopen payment to use the latest total.');return;}
        checkoutLock.current=true;setIsProcessing(true);setPaymentError('');
        try{
            const savedDetails={...paymentOrder.payload.details,no_print:isPrintingDisabled()||paymentOrder.payload.details.no_print,receipt_exchange_rate:paymentOrder.rate,payment_method:payment.method==='whish'?'WHISH Money':'Cash',payment};
            const result=await api.post('/api/checkout',{...paymentOrder.payload,details:savedDetails});
            if(!savedDetails.no_print)setReceipt(result.data.receipt||{order_id:result.data.orderId,customer_name:paymentOrder.payload.customerName,total_amount:paymentOrder.payload.totalAmount,order_date:result.data.timestamp,details:savedDetails});
            setPaymentOrder(null);
            await removeOrder(paymentOrder.id);
        }catch(error){setPaymentError(error.response?.data?.error||error.message||'Could not save payment.');}
        finally{checkoutLock.current=false;setIsProcessing(false);}
    };

    if (!draftsReady || loading || loadError) return <LoadingState page label="Loading POS products..." error={loadError} onRetry={fetchData} />;

    return (
        <>
            {splitSource && <SplitOrderDialog order={splitSource} onCancel={() => setSplitSource(null)} onConfirm={confirmSplit} />}
            {preparation && <PreparationDialog items={preparation.items} tableName={preparation.tableName} floorName={preparation.floorName} onClose={closePreparation} onPrinted={confirmPreparation} />}
            {printChoice && <dialog ref={printChoiceDialog} className="order-print-dialog" aria-labelledby="print-choice-title" aria-describedby="print-choice-description" onCancel={event => { event.preventDefault(); if (!isProcessing) setPrintChoice(false); }}>
                <header><span className="order-print-icon"><Printer size={24} /></span><button type="button" aria-label="Cancel printing" disabled={isProcessing} onClick={() => setPrintChoice(false)}><X size={20} /></button></header>
                <h2 id="print-choice-title">Print order updates</h2>
                <p id="print-choice-description">Choose what to send to Bar and Kitchen for {activeOrder?.label}.</p>
                <div className="order-print-choices">
                    <button type="button" className="order-print-recommended" disabled={isProcessing} onClick={() => startPreparation(false)}><Plus size={20} /><span><strong>Print updates only</strong><small>New quantities and changed item notes.</small></span><span className="order-print-badge">Recommended</span></button>
                    <button type="button" disabled={isProcessing} onClick={() => startPreparation(true)}><Printer size={20} /><span><strong>Print entire order</strong><small>Reprint all items, including previous items.</small></span></button>
                </div>
                <footer><p>Skip these updates and continue to check in. Future changes will still ask to print.</p><button type="button" disabled={isProcessing} onClick={skipPreparation}><SkipForward size={18} />{isProcessing ? 'Saving...' : 'Skip printing'}</button></footer>
            </dialog>}
            {receipt&&<ReceiptDialog autoPrint order={receipt} onClose={()=>setReceipt(null)}/>}
            {paymentOrder&&<CashPaymentDialog total={paymentOrder.payload.totalAmount} rate={paymentOrder.rate} busy={isProcessing} error={paymentError} onCancel={()=>{if(!isProcessing)setPaymentOrder(null);}} onConfirm={confirmPayment}/>}
            <OrderOptions
                optionsOpen={optionsOpen}
                setOptionsOpen={setOptionsOpen}
                optionOpen={optionOpen}
                setOptionOpen={setOptionOpen}
                activeOrder={activeOrder}
                tables={tables}
                tableBusy={tableBusy}
                tableError={tableError}
                handleActiveOption={handleActiveOption}
                handleSaveChanges={handleSaveChanges}
            />
            <div className={`main-order-area mobile-panel-${mobilePanel}`}>
                <div className="mobile-order-tabs" aria-label="Order view">
                    <button aria-pressed={mobilePanel === 'products'} onClick={() => setMobilePanel('products')}>Products</button>
                    <button aria-pressed={mobilePanel === 'cart'} onClick={() => setMobilePanel('cart')}><span>Cart ({activeOrder?.items?.reduce((sum, item) => sum + item.qty, 0) || 0})</span><span className="mobile-cart-total">{formatPrice(totalPrice)}</span></button>
                </div>
                <div className='order-area'>
                    <div className="mobile-order-context">
                        <span>{activeOrder ? `Order: ${activeOrder.label}${activeOrder.tableName ? ` · Table: ${activeOrder.tableName}` : ''}` : 'Create an order to start adding products'}</span>
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
                                        <button className="close-btn" aria-label={`Close ${order.label}`} onClick={(e) => handleCloseOrder(order.id, e)}>
                                            <X />
                                        </button>
                                        <Ticket className="order-icon" />
                                        <span className="order-label">{order.label}{order.tableName && order.label !== order.tableName ? ` · ${order.tableName}` : ''}</span>
                                    </div>
                                ))}
                            <button className='new-order-btn' onClick={addOrder} aria-label="Create order">
                                <Plus />
                            </button>
                        </div>
                    </div>
                    <div className="order-items-list">
                        {activeOrder && activeOrder.items.length > 0 ? (
                            activeOrder.items.map((item, index) => (
                                <div key={lineKey(item, index)} className="order-item-row">
                                    <div className='item-name-price-area'>
                                        <span className="item-name">{item.product_name}</span>
                                        <span className='item-price'>{formatPrice(item.product_price * item.qty)}</span>
                                        <textarea className="item-kitchen-note" aria-label={`Note for ${item.product_name}, line ${index + 1}`} placeholder="Item note (optional)" value={item.note || ''} onChange={event => updateItemNote(index, event.target.value)} rows={1} />
                                    </div>
                                    <span className="qty-control-area">
                                        <button aria-label={`Remove one ${item.product_name}`} className='decrease-qty' onClick={() => removeProductFromOrder(item, index)}><Minus /></button>
                                        <span className="item-qty">{item.qty}x</span>
                                        <button aria-label={`Add one ${item.product_name}`} className='increase-qty' onClick={() => updateActiveOrder({ items: activeOrder.items.map((line, lineIndex) => lineIndex === index ? { ...line, qty: line.qty + 1 } : line) })}><Plus /></button>
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
                        <button type="button" className={`printing-all-toggle ${printingDisabled ? 'printing-stopped' : ''}`} aria-pressed={printingDisabled} disabled={isProcessing} onClick={() => {
                            try { setPrintingDisabled(!printingDisabled); }
                            catch { alert('Could not save the printing preference.'); }
                        }}>
                            <Printer size={18} /><span>{printingDisabled ? 'Resume printing for all' : 'Stop printing for all'}</span>
                        </button>
                        {printingDisabled && <p className="printing-all-status" role="status">Printing is off for all orders on this register. Checkout opens directly.</p>}
                        <div className='order-total'>
                            {discountAmount > 0 && <span className='order-discount-summary'>Subtotal {formatPrice(subtotal)} · Discount {formatPrice(discountAmount)}</span>}
                            <span className='total-text'>Total</span>
                            <span className='total-price'>{formatPrice(totalPrice)}</span>
                        </div>
                        <div className='order-action-buttons'>
                            <button
                                aria-label='Order options' className='order-options'
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
                                    <><CircleCheckBig /><span>{needsPreparation ? 'Print order' : 'Check in'}</span></>
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
