import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { preparationStation } from '../utils/preparation.js';
import './ReceiptDialog.css';
import './PreparationDialog.css';

export default function PreparationDialog({ items, onClose, onPrinted }) {
    const dialog = useRef(null);
    const pageStyle = useRef(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [printOpened, setPrintOpened] = useState(false);
    const [paper, setPaper] = useState(() => {
        try { return localStorage.getItem('receipt-paper') === '58' ? '58' : '80'; } catch { return '80'; }
    });
    function print() {
        setError('');
        try {
            pageStyle.current?.remove();
            const heights = [...dialog.current.querySelectorAll('.receipt-paper')].map(ticket => {
                const sample = ticket.cloneNode(true);
                Object.assign(sample.style, { position: 'fixed', visibility: 'hidden', width: paper === '58' ? '48mm' : '72mm', maxWidth: 'none', padding: '0', margin: '0', display: 'flow-root' });
                document.body.appendChild(sample);
                const height = Math.ceil(sample.getBoundingClientRect().height * 25.4 / 96) + 3;
                sample.remove();
                return height;
            });
            const style = document.createElement('style');
            style.textContent = `@media print { @page receipt { size: ${paper}mm ${Math.max(...heights)}mm; margin: 0; } }`;
            document.head.appendChild(style);
            pageStyle.current = style;
            window.print();
            setPrintOpened(true);
        } catch { setError('Could not open printing. Please try again.'); }
    }
    useEffect(() => {
        dialog.current.showModal();
        const timer = setTimeout(print, 150);
        return () => { clearTimeout(timer); pageStyle.current?.remove(); };
    }, []);
    async function confirm() {
        setBusy(true);
        try { await onPrinted(); } catch (failure) { setError('Could not save print status: ' + failure.message); setBusy(false); }
    }
    return createPortal(<dialog ref={dialog} className="receipt-dialog preparation-dialog" style={{ '--receipt-width': paper === '58' ? '48mm' : '72mm' }} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }} aria-labelledby="preparation-title">
        <header className="receipt-controls"><h2 id="preparation-title">Bar &amp; kitchen slips</h2><button disabled={busy} onClick={onClose}>Cancel</button></header>
        <div className="receipt-toolbar"><label>Paper size<select value={paper} onChange={event => setPaper(event.target.value)}><option value="80">80 mm</option><option value="58">58 mm</option></select></label><button onClick={print} disabled={busy}>Print both slips</button></div>
        {error && <p className="receipt-print-error" role="alert">{error}</p>}
        <div className="receipt-preview">{['Bar', 'Kitchen'].map(station => <article className="receipt-paper preparation-slip" key={station}>
            <header><h1>{station}</h1></header>
            <table><thead><tr><th>Item / Note</th><th>Qty</th></tr></thead><tbody>{items.filter(item => preparationStation(item) === station).map((item, index) => <tr key={index}><td>{item.product_name}{item.noteChanged && <small>UPDATED NOTE — replaces previous instruction</small>}{item.note && <small>{item.note}</small>}</td><td>{item.qty}</td></tr>)}</tbody></table>
        </article>)}</div>
        <footer className="receipt-controls"><span>Confirm after both slips print. If printing was cancelled, retry or cancel here.</span><button className="receipt-print-button" disabled={busy || !printOpened} onClick={confirm}>{busy ? 'Saving…' : 'Receipts printed'}</button></footer>
    </dialog>, document.body);
}
