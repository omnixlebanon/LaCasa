import { useCurrency } from '../../../global.jsx';
import React, { useState } from "react";
const REGIONS = [
	"In store",
	"Takeaway",
	"Delivery"
];

import { X, ShoppingBag, CheckCircle } from "lucide-react";
export const AddTransactionModal = ({ isOpen, onClose, products, onAddTransaction }) => {
  const { formatPrice: formatCurrency } = useCurrency();
	const [selectedProductId, setSelectedProductId] = useState(products[0]?.id || "");
	const [quantity, setQuantity] = useState(1);
	const [region, setRegion] = useState(REGIONS[0]);
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState("");
	if (!isOpen) return null;
	const selectedProduct = products.find((p) => p.id === selectedProductId) || products[0];
	const totalRevenue = selectedProduct ? selectedProduct.unitPrice * quantity : 0;
	const totalCost = selectedProduct ? selectedProduct.unitCost * quantity : 0;
	const totalProfit = totalRevenue - totalCost;
	const handleSubmit = async (e) => {
		e.preventDefault();
		if (!selectedProduct || submitting || !Number.isInteger(quantity) || quantity < 1 || quantity > 100) return;
		const newTx = {
			id: `TX-${Date.now()}`,
			productId: selectedProduct.id,
			productName: selectedProduct.name,
			category: selectedProduct.category,
			quantity,
			unitPrice: selectedProduct.unitPrice,
			unitCost: selectedProduct.unitCost,
			totalRevenue,
			totalCost,
			totalProfit,
			timestamp: new Date().toISOString(),
			customerRegion: region
		};
		setSubmitting(true);
		setError("");
		try {
			await onAddTransaction(newTx);
			onClose();
		} catch {
			setError("Sale could not be recorded. Check order history before retrying.");
		} finally {
			setSubmitting(false);
		}
	};
	return <div role="dialog" aria-modal="true" aria-label="Record paid sale" className="fixed inset-0 z-50 flex items-center justify-center p-4 sales-modal-backdrop backdrop-blur-sm animate-fade-in">
      <div className="bg-white border border-slate-200 w-full max-w-lg rounded-2xl p-6 shadow-2xl relative space-y-5">
        {	/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <div className="flex items-center space-x-2">
            <div className="p-2 bg-emerald-500/10 text-emerald-700 rounded-xl border border-emerald-500/20">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Record New Real-Time Sale</h2>
              <p className="text-xs text-slate-500">Instantly update financial pie & line charts</p>
            </div>
          </div>
          <button disabled={submitting} onClick={onClose} className="text-slate-500 hover:text-slate-900 p-1 rounded-lg hover:bg-slate-100 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {	/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <p role="alert" className="text-rose-700">{error}</p>}
          <p className="text-xs text-slate-500">Records a paid order and deducts recipe ingredients from stock.</p>
          {	/* Select Product */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Select Product
            </label>
            <select value={selectedProductId} onChange={(e) => setSelectedProductId(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-emerald-500">
              {products.map((p) => <option key={p.id} value={p.id}>
                  {p.name} ({formatCurrency(p.unitPrice)} | Cost: {formatCurrency(p.unitCost)})
                </option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {	/* Quantity */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Quantity Sold
              </label>
              <input type="number" min="1" max="100" value={quantity} onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-emerald-500" />
            </div>

            {	/* Region */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Sale Channel
              </label>
              <select value={region} onChange={(e) => setRegion(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-emerald-500">
                {REGIONS.map((r) => <option key={r} value={r}>
                    {r}
                  </option>)}
              </select>
            </div>
          </div>

          {	/* Financial Preview Box */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Financial Outcome
            </div>
            <div className="grid grid-cols-3 gap-2 text-center pt-1">
              <div className="bg-white p-2 rounded-lg border border-slate-200">
                <div className="text-[10px] text-slate-500">Total Revenue</div>
                <div className="text-sm font-bold text-slate-900 mt-0.5">
                  {formatCurrency(totalRevenue)}
                </div>
              </div>
              <div className="bg-white p-2 rounded-lg border border-slate-200">
                <div className="text-[10px] text-slate-500">Cost</div>
                <div className="text-sm font-bold text-slate-500 mt-0.5">
                  {formatCurrency(totalCost)}
                </div>
              </div>
              <div className="bg-white p-2 rounded-lg border border-slate-200">
                <div className="text-[10px] text-emerald-700 font-medium">Est. Gross Profit</div>
                <div className="text-sm font-bold text-emerald-700 mt-0.5">
                  +{formatCurrency(totalProfit)}
                </div>
              </div>
            </div>
          </div>

          {	/* Buttons */}
          <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-200">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-medium text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors">
              Cancel
            </button>
            <button disabled={submitting || !selectedProduct} type="submit" className="flex items-center space-x-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-xs font-semibold shadow-md  transition-all">
              <CheckCircle className="w-4 h-4" />
              <span>{submitting ? "Recording..." : "Record Paid Sale"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>;
};
