import { useEffect, useRef } from 'react';
import { RotateCcw, X, LoaderCircle } from 'lucide-react';
import './RefundDialog.css';

export default function RefundDialog({ order, amount, busy, error, onCancel, onSubmit }) {
    const dialog = useRef(null);
    useEffect(() => { dialog.current.showModal(); }, []);
    return (
        <dialog ref={dialog} className="refund-dialog" aria-labelledby="refund-title" onCancel={event => { event.preventDefault(); if (!busy) onCancel(); }}>
            <form onSubmit={onSubmit}>
                <header className="refund-dialog-header">
                    <span className="refund-dialog-icon"><RotateCcw size={22} /></span>
                    <div><h2 id="refund-title">Refund order</h2><p>Order #{order.order_id}</p></div>
                    <button className="refund-dialog-close" type="button" disabled={busy} aria-label="Cancel refund" onClick={onCancel}><X size={20} /></button>
                </header>
                <div className="refund-dialog-body">
                    <div className="refund-dialog-amount"><span>Full refund amount</span><strong>{amount}</strong></div>
                    <label className="refund-reason-label" htmlFor="refund-reason">Reason for refund</label>
                    <textarea id="refund-reason" name="reason" placeholder="Tell us why this order is being refunded" rows={3} required maxLength={500} disabled={busy} />
                    <fieldset className="refund-stock-options" disabled={busy}>
                        <legend>What should happen to stock?</legend>
                        <label><input type="radio" name="stock" value="keep" required /><span><strong>Keep stock unchanged</strong><small>Ingredients were already used or cannot be reused.</small></span></label>
                        <label><input type="radio" name="stock" value="return" required /><span><strong>Return ingredients to stock</strong><small>Restore quantities only if the ingredients are unused and available.</small></span></label>
                    </fieldset>
                    {error && <p className="refund-dialog-error" role="alert">{error}</p>}
                </div>
                <footer className="refund-dialog-footer">
                    <button className="refund-dialog-cancel" type="button" disabled={busy} onClick={onCancel}>Cancel</button>
                    <button className="refund-dialog-confirm" type="submit" disabled={busy}>{busy && <LoaderCircle size={17} className="refund-dialog-spinner" />}{busy ? 'Saving refund...' : 'Confirm refund'}</button>
                </footer>
            </form>
        </dialog>
    );
}
