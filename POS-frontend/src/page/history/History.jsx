import LoadingState from '../../components/LoadingState.jsx';
import useMobile from '../../hooks/useMobile.js';
import { useState, useEffect, useMemo, useRef } from 'react';
import './History.css';
import { History as HistoryIcon, X } from 'lucide-react';
import api, { apiAssetUrl } from '/src/api.js';
import { useCurrency } from '../../global.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import WorkflowRequests from '../../components/workflow/WorkflowRequests.jsx';
function OrderHistory() {
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const isMobile = useMobile();
    const [filter, setFilter] = useState('daily');
    const [statusFilter, setStatusFilter] = useState('');
    const [history, setHistory] = useState([]);
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [selectedEvidence, setSelectedEvidence] = useState(null);
    const [evidenceError, setEvidenceError] = useState(false);
    const evidenceDialogRef = useRef(null);
    useEffect(() => {
        const dialog = evidenceDialogRef.current;
        if (!dialog) return;
        if (selectedEvidence && !dialog.open) dialog.showModal();
        else if (!selectedEvidence && dialog.open) dialog.close();
    }, [selectedEvidence, loading, loadError]);
    const [refundOpen, setRefundOpen] = useState(null)
    const [refundRequestId, setRefundRequestId] = useState(null);
    const { formatPrice } = useCurrency();
    const { user } = useAuth();
    const isManager = user?.accessLevel === 'admin' || /manager|owner|supervisor/i.test(user?.position || '');
    const fetchData = async () => {
        setLoading(true);
        setLoadError('');
        try {
            const response = await api.get('/api/history');
            setHistory(response.data || []);
        } catch (error) {
            console.error("Error fetching order history:", error);
            setLoadError('Could not load order history. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const filteredHistory = useMemo(() => {
        let result = [...history];
        if (!isManager) result = result.filter(item => item.status?.toLowerCase() !== 'refunded');
        if (statusFilter === 'discounted') {
            result = result.filter(item => Number(getOrderDetails(item)?.discount) > 0);
        } else if (statusFilter) {
            result = result.filter(item => item.status?.toLowerCase() === statusFilter.toLowerCase());
        }

        const now = new Date();
        result = result.filter((item) => {
            const orderDate = new Date(item.order_date || item.created_at);
            if (isNaN(orderDate.getTime())) return true;

            const isToday =
                orderDate.getDate() === now.getDate() &&
                orderDate.getMonth() === now.getMonth() &&
                orderDate.getFullYear() === now.getFullYear();

            if (filter === 'daily') {
                return isToday;
            }

            const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const orderMidnight = new Date(orderDate.getFullYear(), orderDate.getMonth(), orderDate.getDate());

            const diffTime = todayMidnight - orderMidnight;
            const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

            if (filter === 'weekly') {
                return diffDays >= 0 && diffDays <= 7;
            } else if (filter === 'monthly') {
                return diffDays >= 0 && diffDays <= 30;
            }
            return true;
        });

        return result.sort((a, b) => new Date(b.order_date) - new Date(a.order_date));
    }, [history, filter, statusFilter, isManager]);

    function getOrderDetails(order) {
        if (!order) return {};
        if (typeof order.details !== 'string') return order.details || {};
        try { return JSON.parse(order.details); } catch { return {}; }
    }

    const getOrderItems = (order) => {
        if (!order) return [];
        const detailsObj = getOrderDetails(order);
        return detailsObj?.items || [];
    };

    const handleStatusToggle = (status) => {
        setStatusFilter(prev => prev === status ? '' : status);
    };

    const selectedOrderTotal = useMemo(() => {
        return Number(selectedOrder?.total_amount) || 0;
    }, [selectedOrder]);

    const submitRefund = async (event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        try {
            const response = await api.post(`/api/history/${refundOpen.order_id}/refund-request`, { reason: data.get('reason'), confirmed: data.get('confirmed') === 'on' });
            setRefundRequestId(response.data.requestId);
        } catch (error) { alert(error.response?.data?.error || 'Refund failed.'); }
    };

    if (loading || loadError) return <LoadingState page label="Loading order history..." error={loadError} onRetry={fetchData} />;

    return (
        <>
            <dialog className="refund-evidence-dialog" ref={evidenceDialogRef} aria-labelledby="refund-evidence-title" onClose={() => setSelectedEvidence(null)}>
                <div className="refund-evidence-header">
                    <h3 id="refund-evidence-title">Refund evidence{selectedEvidence && ` — Order #${selectedEvidence.order_id || selectedEvidence.id}`}</h3>
                    <button type="button" className="close-btn" autoFocus aria-label="Close refund evidence" onClick={() => evidenceDialogRef.current.close()}><X /></button>
                </div>
                {selectedEvidence && (evidenceError
                    ? <p className="refund-evidence-error" role="alert">This evidence image could not be loaded. Please check the saved attachment.</p>
                    : <img className="refund-evidence-image" src={apiAssetUrl(selectedEvidence.refund_evidence)} alt={`Refund evidence for order #${selectedEvidence.order_id || selectedEvidence.id}`} onError={() => setEvidenceError(true)} />)}
            </dialog>
            {selectedOrder && (
                <div className="editPopup">
                    <div className="editPopup-container">
                        <div className="editPopup-head">
                            <p>Order (#{selectedOrder.order_id || selectedOrder.id})</p>
                            <button className="close-btn" onClick={() => setSelectedOrder(null)}>
                                <X />
                            </button>
                        </div>
                        <ul className="order-summary">
                            {getOrderItems(selectedOrder).map((prod, index) => (
                                <li className='order-summary-product' key={prod.product_id || index} >
                                    <span className='order-summary-product-name'>{prod.product_name} </span>
                                    <span className='order-summary-product-qty'>x{prod.qty}</span>
                                </li>
                            ))}
                            {getOrderItems(selectedOrder).length === 0 && (
                                <li>No items recorded in this order.</li>
                            )}
                        </ul>
                        <hr />

                        <hr />
                        <div className='order-summary-total'>
                            <span className='total-text'>Total:</span>
                            <span className='total-price'>{formatPrice(selectedOrderTotal)}</span>
                        </div>
                    </div>
                </div>
            )}
            {refundOpen && (
                <div className="editPopup">
                    <form className="editPopup-container" onSubmit={submitRefund}>
                        <div className="editPopup-head">
                            <p>Refunding (#{refundOpen.order_id})</p>
                            <button type="button" className="close-btn" onClick={() => { setRefundOpen(null); setRefundRequestId(null); }}>
                                <X />
                            </button>
                        </div>
                        {refundRequestId ? <div className="input-area refund-telegram-step">
                            <p>Refund request #{refundRequestId} was saved.</p>
                            <p>Open Telegram and send:</p>
                            <code>/refund {refundRequestId}</code>
                            <p>Then send the evidence image. A manager can review it after the image is attached.</p>
                            <button type="button" onClick={() => { setRefundOpen(null); setRefundRequestId(null); }}>Done</button>
                        </div> : <div className="input-area">
                            <div className="label-input">
                                <label htmlFor="refund-reason">Enter the reason for refund</label>
                                <input id="refund-reason" name="reason" type="text" required />
                            </div>
                            <div className='checkbox-area'>
                                <input type="checkbox" name="confirmed" id="refund-confirmed" required />
                                <label htmlFor="refund-confirmed">I confirm the refund details are accurate and understand they will be reviewed.</label>
                            </div>
                            <div className="edit-submit-container"><button type="submit">Save and Get Telegram Code</button></div>
                        </div>}
                    </form>
                </div>
            )}

            <div className='main-area'>
                <div className="head-area">
                    <div className="PageTitle">
                        <HistoryIcon />
                        <h2 className="PageName">Orders History</h2>
                    </div>
                </div>

                <div className="search-nav history-nav">
                    <div className="searchButtons">
                        <button
                            className={`search-button ${filter === "daily" ? "active" : ""}`}
                            onClick={() => setFilter('daily')}
                        >
                            Daily
                        </button>
                        <button
                            className={`search-button ${filter === "weekly" ? "active" : ""}`}
                            onClick={() => setFilter('weekly')}
                        >
                            Weekly
                        </button>
                        <button
                            className={`search-button ${filter === "monthly" ? "active" : ""}`}
                            onClick={() => setFilter('monthly')}
                        >
                            Monthly
                        </button>
                    </div>

                    {isManager && <div className="state-buttons">
                        <button className={`search-button ${statusFilter === "discounted" ? "active" : ""}`} onClick={() => handleStatusToggle('discounted')}>Discounted</button>
                        <button className={`search-button ${statusFilter === "refund_requests" ? "active" : ""}`} onClick={() => handleStatusToggle('refund_requests')}>Refund Requests</button>
                        <button
                            className={`search-button ${statusFilter === "refunded" ? "active" : ""}`}
                            onClick={() => handleStatusToggle('refunded')}
                        >
                            Refunded
                        </button>
                    </div>}
                </div>

                <div className='Gap-1rem' />

                {isManager && statusFilter === 'refund_requests' && <><WorkflowRequests  type="refund" title="Refund Requests" emptyMessage="No refund requests have been submitted." onReviewed={fetchData} /><div className='Gap-1rem' /></>}

                {statusFilter !== 'refund_requests' && <div className='history-display-area'>
                    <table border='1'>
                        <thead>
                            <tr>
                                <th>Order ID</th>
                                <th>Customer Name/Table</th>
                                <th>Order Date</th>
                                <th>Order Details</th>
                                <th>Payment Method</th>
                                <th>{statusFilter === 'refunded' ? 'Refund Details' : statusFilter === 'discounted' ? 'Discount' : 'Actions'}</th>

                            </tr>
                        </thead>
                        <tbody>
                            {filteredHistory.length > 0 ? (
                                filteredHistory.map((item) => {
                                    return (
                                        <tr key={item.order_id || item.id}>
                                            <td data-label="Order ID">{item.order_id || item.id}</td>
                                            <td data-label="Customer / table">{item.customer_name || getOrderDetails(item).order_label || 'Guest'}</td>
                                            <td data-label="Date">
                                                {item.order_date
                                                    ? new Date(item.order_date).toLocaleString()
                                                    : 'N/A'}
                                            </td>
                                            <td data-label="Details">
                                                <button
                                                    className="view-details-btn"
                                                    onClick={() => setSelectedOrder(item)}

                                                >
                                                    View details
                                                </button>
                                            </td>
                                            {isMobile && <td data-label="Total">{formatPrice(Number(item.total_amount) || 0)}</td>}
                                            <td data-label="Payment">{item.payment_method || 'N/A'}</td>
                                            <td data-label="Status / details">
                                                {item.status?.toLowerCase() === 'refunded' ?
                                                        (statusFilter === 'refunded'
                                                            ? <span>{item.refund_reason || 'No reason'}{item.refund_evidence && <button type="button" className="refund-evidence" onClick={() => { setEvidenceError(false); setSelectedEvidence(item); }}>Evidence</button>}</span>
                                                            : <span className="history-refunded-status">Refunded</span>)
                                                        :
                                                        statusFilter === 'discounted' ? <span>{formatPrice(Number(getOrderDetails(item).discount) || 0)}</span> :
                                                        <button className='refund-btn' onClick={() => { setRefundRequestId(null); setRefundOpen(item); }}>Refund</button>
                                                }
                                            </td>
                                        </tr>
                                    );
                                })
                            ) : (
                                <tr>
                                    <td colSpan={isMobile ? 7 : 6} style={{ textAlign: 'center', padding: '1rem' }}>
                                        No records found matching the selection.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>}
            </div>
        </>
    );
}

export default OrderHistory;
