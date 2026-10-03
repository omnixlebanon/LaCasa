import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { preparationStation } from '../utils/preparation.js';
import './ReceiptDialog.css';
import './PreparationDialog.css';

// This content is visible only to the printer.
export default function PreparationDialog({ items, tableName, floorName, onClose, onPrinted }) {
    const [station, setStation] = useState('Bar');
    const container = useRef(null);
    const callbacks = useRef({ onClose, onPrinted });
    callbacks.current = { onClose, onPrinted };
    const paper = useRef((() => {
        try { return localStorage.getItem('receipt-paper') === '58' ? '58' : '80'; } catch { return '80'; }
    })()).current;
    useEffect(() => {
        let pageStyle;
        let finished = false;
        const finish = async () => {
            if (finished) return;
            finished = true;
            // Separate jobs give the driver a final cut boundary for each slip.
            // Wait for afterprint before rendering and submitting the next job.
            if (station === 'Bar') {
                setStation('Kitchen');
                return;
            }
            try { await callbacks.current.onPrinted(); }
            catch (error) {
                alert('Could not save print status: ' + error.message);
                callbacks.current.onClose();
            }
        };
        window.addEventListener('afterprint', finish);
        const timer = setTimeout(() => {
            try {
                const heights = [...container.current.querySelectorAll('.receipt-paper')].map(ticket => {
                    const sample = ticket.cloneNode(true);
                    Object.assign(sample.style, { position: 'fixed', visibility: 'hidden', width: paper === '58' ? '48mm' : '72mm', maxWidth: 'none', padding: '0', margin: '0', display: 'flow-root' });
                    document.body.appendChild(sample);
                    const height = Math.ceil(sample.getBoundingClientRect().height * 25.4 / 96) + 3;
                    sample.remove();
                    return height;
                });
                // Short slips must still have portrait dimensions so drivers do not rotate them.
                const heightMm = Math.max(Number(paper) + 1, ...heights);
                pageStyle = document.createElement('style');
                pageStyle.textContent = '@media print { @page { size: ' + paper + 'mm ' + heightMm + 'mm; margin: 0; } @page preparation { size: ' + paper + 'mm ' + heightMm + 'mm; margin: 0; } }';
                document.head.appendChild(pageStyle);
                window.print();
            } catch (error) {
                alert('Could not open printing: ' + error.message);
                callbacks.current.onClose();
            }
        }, 150);
        return () => { clearTimeout(timer); window.removeEventListener('afterprint', finish); pageStyle?.remove(); };
    }, [paper, station]);
    return createPortal(<div ref={container} className="preparation-print" aria-hidden="true" style={{ '--receipt-width': paper === '58' ? '48mm' : '72mm' }}>
        <article className="receipt-paper preparation-slip" key={station}>
            <header><h1>{station}</h1><p>Table: {tableName || 'No table'}</p><p>Floor: {floorName || 'No floor'}</p></header>
            <table><thead><tr><th>Item / Note</th><th>Qty</th></tr></thead><tbody>{items.filter(item => preparationStation(item) === station).map((item, index) => <tr key={index}><td>{item.product_name}{item.noteChanged && <small>UPDATED NOTE - replaces previous instruction</small>}{item.note && <small>{item.note}</small>}</td><td>{item.qty}</td></tr>)}</tbody></table>
        </article>
    </div>, document.body);
}
