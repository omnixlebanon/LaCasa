import { useEffect, useState, useSyncExternalStore } from 'react';
import { LoaderCircle } from 'lucide-react';
import { getPendingRequests, subscribeToRequests } from '../requestActivity.js';
import './LoadingState.css';

export default function RequestActivity() {
  const pending = useSyncExternalStore(subscribeToRequests, getPendingRequests, () => 0);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (pending > 0) {
      setVisible(true);
      return;
    }
    // Keep feedback readable without holding back the fetched content.
    const timer = setTimeout(() => setVisible(false), 400);
    return () => clearTimeout(timer);
  }, [pending]);

  if (!pending && !visible) return null;
  return <div className="request-activity" role="status" aria-live="polite">
    <LoaderCircle className="fetch-state-spinner" size={20} aria-hidden="true" />
    <span>{pending ? 'Loading data...' : 'Data loaded'}</span>
  </div>;
}
