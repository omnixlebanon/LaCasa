import WorkflowRequests from '../../workflow/WorkflowRequests.jsx';
import './AIProcessingLogs.css';

export default function AIProcessingLogs() {
  return <div className="stock-workflows">
    <WorkflowRequests type="stock_receipt" title="Stock Receipt Approvals" emptyMessage="No stock receipts are waiting for review." />
    <WorkflowRequests type="stock_usage" title="Ingredient Usage Approvals" emptyMessage="No ingredient usage is waiting for review." />
  </div>;
}
