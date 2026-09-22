import { LoaderCircle } from 'lucide-react';
import './LoadingState.css';

export default function LoadingState({ label = 'Loading...', error, onRetry, page = false }) {
  const content = error ? <div className="fetch-state fetch-state-error" role="alert">
    <p>{error}</p>
    {onRetry && <button type="button" onClick={onRetry}>Try again</button>}
  </div> : <div className="fetch-state" role="status" aria-live="polite">
    <LoaderCircle className="fetch-state-spinner" size={24} aria-hidden="true" />
    <span>{label}</span>
  </div>;
  return page ? <div className="main-area" aria-busy={!error}>{content}</div> : content;
}
