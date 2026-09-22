import LoadingState from '../LoadingState.jsx';
import { useCallback, useEffect, useState } from 'react';
import { Check, RefreshCw, X } from 'lucide-react';
import api, { apiAssetUrl } from '../../api.js';
import './WorkflowRequests.css';
import RequestMessage from './RequestMessage.jsx';

export default function WorkflowRequests({ type, title, emptyMessage, onReviewed, readOnly = false }) {
  const [requests, setRequests] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try { const response = await api.get(`/api/management/requests?type=${type}`); setRequests(response.data || []); setError(''); }
    catch (requestError) { setError(requestError.response?.data?.error || 'Could not load requests.'); }
    finally { setLoading(false); }
  }, [type]);
  useEffect(() => { load(); }, [load]);
  const review = async (id, status) => {
    try { await api.patch(`/api/management/requests/${id}`, { status }); await load(); await onReviewed?.(); }
    catch (requestError) { setError(requestError.response?.data?.error || 'Could not review request.'); }
  };
  return <section className="workflow-requests">
    <div className="workflow-head"><h3>{title}</h3><button onClick={load} disabled={loading}><RefreshCw /> Refresh</button></div>
    {loading && <LoadingState label={`Loading ${title.toLowerCase()}...`} />}
    {error && <LoadingState error={error} onRetry={load} />}
    {!requests.length && !loading && !error && <p className="workflow-empty">{emptyMessage || 'No requests found.'}</p>}
    <div className="workflow-list">{!loading && !error && requests.map(request => {
      const readyForReview = (request.request_type || type) !== 'refund' || request.payload?.evidenceData;
      return <article className="workflow-card" key={request.request_id}>
      <div className="workflow-card-head"><span className={`workflow-status ${request.status}`}>{request.status}</span><strong>Request #{request.request_id}</strong><small>{new Date(request.created_at).toLocaleString()}</small></div>
      <RequestMessage request={request} type={type} />
      {request.payload?.evidenceData && <img className="workflow-evidence" loading="lazy" src={apiAssetUrl(request.payload.evidenceData)} alt="Refund evidence" />}
      {!readyForReview && <p className="workflow-awaiting">Awaiting evidence from Telegram</p>}
      {!readOnly && request.status === 'pending' && readyForReview && <div className="workflow-actions"><button className="approve" onClick={() => review(request.request_id, 'approved')}><Check /> Approve</button><button className="reject" onClick={() => review(request.request_id, 'rejected')}><X /> Reject</button></div>}
    </article>})}</div>
  </section>;
}
