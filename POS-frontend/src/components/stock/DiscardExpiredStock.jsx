import LoadingState from '../LoadingState.jsx';
import { useRef, useState } from 'react';
import { Trash2, X } from 'lucide-react';
import api from '../../api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import './DiscardExpiredStock.css';

export default function DiscardExpiredStock({ onRemoved }) {
    const { user } = useAuth();
    const canRemove = user?.accessLevel === 'admin' || /manager|owner|supervisor/i.test(user?.position || '');
    const dialogRef = useRef(null);
    const [batches, setBatches] = useState([]);
    const [phase, setPhase] = useState('');
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const openPreview = async () => {
        setBatches([]); setError(''); setMessage(''); setPhase('loading');
        dialogRef.current.showModal();
        try { setBatches((await api.get('/api/stock/expired-batches')).data); }
        catch (requestError) { setError(requestError.response?.data?.error || 'Could not load expired stock. Please try again.'); }
        finally { setPhase(''); }
    };
    const removeStock = async () => {
        if (phase || !batches.length) return;
        setPhase('removing'); setError('');
        try {
            const { data } = await api.post('/api/stock/discard-expired', {
                batches: batches.map(({ batch_id, batch_stock, batch_exDate }) => ({ batch_id, batch_stock, batch_exDate })),
            });
            dialogRef.current.close();
            setMessage(`Removed expired stock from ${data.removedBatches} ${data.removedBatches === 1 ? 'batch' : 'batches'}.`);
            await onRemoved();
        } catch (requestError) { setError(requestError.response?.data?.error || 'Could not remove expired stock. Please try again.'); }
        finally { setPhase(''); }
    };
    if (!canRemove) return null;
    return <>
        <button className="discard-expired-button" type="button" onClick={openPreview} disabled={!!phase}><Trash2 />Remove expired stock</button>
        {message && <p className="discard-expired-success" role="status">{message}</p>}
        <dialog ref={dialogRef} className="discard-expired-dialog" aria-labelledby="discard-expired-title" onCancel={event => { if (phase === 'removing') event.preventDefault(); }}>
            <header><h3 id="discard-expired-title">Remove expired stock</h3><button type="button" autoFocus aria-label="Close expired stock preview" disabled={phase === 'removing'} onClick={() => dialogRef.current.close()}><X /></button></header>
            <div className="discard-expired-body">
                <p>These expired batch quantities will be set to zero. Stock expiring today or later will be kept.</p>
                {phase === 'loading' && <LoadingState label="Loading expired stock..." />}
                {error && <p className="discard-expired-error" role="alert">{error}</p>}
                {!phase && !error && !batches.length && <p>No expired stock to remove.</p>}
                {!!batches.length && <ul>{batches.map(batch => <li key={batch.batch_id}>
                    <div><strong>{batch.item_name}</strong><span>Batch #{batch.batch_id} · Expired {new Date(`${batch.batch_exDate}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</span></div>
                    <strong>{Number(batch.batch_stock).toLocaleString()} {batch.uom}</strong>
                </li>)}</ul>}
            </div>
            <footer><button type="button" disabled={phase === 'removing'} onClick={() => dialogRef.current.close()}>Cancel</button><button className="discard-expired-confirm" type="button" disabled={!!phase || !!error || !batches.length} onClick={removeStock}>{phase === 'removing' ? 'Removing…' : 'Confirm removal'}</button></footer>
        </dialog>
    </>;
}
