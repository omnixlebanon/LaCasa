import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useCurrency } from '../global.jsx';
import './SplitOrderDialog.css';

export default function SplitOrderDialog({ order, onCancel, onConfirm }) {
    const dialog = useRef(null);
    const [quantities, setQuantities] = useState(order.items.map(() => 0));
    const [label, setLabel] = useState(`${order.label} - split`);
    const [busy, setBusy] = useState(false), [error, setError] = useState('');
    const { formatPrice } = useCurrency();
    useEffect(() => { dialog.current.showModal(); }, []);
    const moved = quantities.reduce((sum, qty, index) => sum + qty * order.items[index].product_price, 0);
    const selected = quantities.reduce((sum, qty) => sum + qty, 0);
    const count = order.items.reduce((sum, item) => sum + item.qty, 0);
    const submit = async event => {
        event.preventDefault();
        if (busy) return;
        setBusy(true); setError('');
        try { await onConfirm(quantities, label.trim()); }
        catch (issue) { setError(issue.message || 'Could not split order.'); setBusy(false); }
    };
    return createPortal(<dialog ref={dialog} className="split-order-dialog" aria-labelledby="split-order-title" onCancel={event => { event.preventDefault(); if (!busy) onCancel(); }}>
        <form onSubmit={submit}>
            <header><h2 id="split-order-title">Split Order</h2><button type="button" aria-label="Close split order" disabled={busy} onClick={onCancel}><X /></button></header>
            <p>Choose quantities to move into a separate bill. Leave at least one item in the original order.</p>
            {order.tableId && <p>The original order keeps the table assignment.</p>}
            <label htmlFor="split-order-name">New order name</label><input id="split-order-name" value={label} onChange={event => setLabel(event.target.value)} required disabled={busy} />
            <div className="split-order-items">{order.items.map((item, index) => <div className="split-order-line" key={index}>
                <div><strong>{item.product_name}</strong>{item.note && <small>{item.note}</small>}<small>{item.qty} available · {formatPrice(item.product_price)} each</small></div>
                <input aria-label={`Move quantity of ${item.product_name}, line ${index + 1}`} type="number" min="0" max={item.qty} step="1" value={quantities[index]} disabled={busy} onChange={event => setQuantities(previous => previous.map((qty, i) => i === index ? Number(event.target.value) : qty))} />
            </div>)}</div>
            <p>Selected subtotal: <strong>{formatPrice(moved)}</strong>. Discounts are shared between both bills.</p>
            {error && <p role="alert" className="error-message">{error}</p>}
            <footer><button type="button" disabled={busy} onClick={onCancel}>Cancel</button><button type="submit" disabled={busy || !label.trim() || selected <= 0 || selected >= count}>{busy ? 'Saving...' : 'Split Order'}</button></footer>
        </form>
    </dialog>, document.body);
}
