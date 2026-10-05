import { lineKey } from './preparation.js';

// Keep the original table owner and distribute printed quantities without reprinting food.
export function splitOrder(order, quantities, id, label) {
    if (!Array.isArray(quantities) || quantities.length !== order.items.length) throw new Error('This order changed. Reopen Split Order.');
    const remaining = [], moved = [], originalPrint = {}, splitPrint = {};
    order.items.forEach((item, index) => {
        const qty = Number(quantities[index]);
        if (!Number.isInteger(qty) || qty < 0 || qty > item.qty) throw new Error('Select valid whole quantities.');
        const key = lineKey(item);
        const printed = order.printedPreparation?.[key];
        const printedQty = printed?.note === (item.note || '') ? Math.min(item.qty, printed.qty) : 0;
        const movedPrinted = Math.min(qty, printedQty);
        if (qty) {
            moved.push({ ...item, qty });
            if (printed) splitPrint[key] = { ...printed, qty: movedPrinted };
        }
        if (item.qty > qty) {
            remaining.push({ ...item, qty: item.qty - qty });
            if (printed) originalPrint[key] = { ...printed, qty: printedQty - movedPrinted };
        }
    });
    if (!moved.length || !remaining.length) throw new Error('Select items to move and leave at least one item in the original order.');
    const subtotal = items => items.reduce((sum, item) => sum + Number(item.product_price) * item.qty, 0);
    let originalDiscount = order.discount, splitDiscount = order.discount;
    if (order.discount && order.discount.type !== 'percent') {
        const fraction = subtotal(moved) / subtotal(order.items);
        const value = Math.max(0, Number(order.discount.value) || 0);
        const movedValue = subtotal(order.items) > 0 ? Math.round(value * fraction * 100) / 100 : 0;
        splitDiscount = { ...order.discount, value: movedValue };
        originalDiscount = { ...order.discount, value: value - movedValue };
    }
    return {
        original: { ...order, items: remaining, discount: originalDiscount, printedPreparation: originalPrint },
        split: { id, checkoutOperationId: id, label, orderType: order.orderType || 'takeout',
            kitchenNote: order.kitchenNote || '', noPrint: !!order.noPrint,
            items: moved, discount: splitDiscount, printedPreparation: splitPrint, preparationPrinted: !!order.preparationPrinted }
    };
}
