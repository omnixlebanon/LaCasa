const barCategories = new Set(['hot drinks', 'cold drinks', 'milkshakes', 'iced coffee', 'frappes', 'smoothies', 'juices', 'water', 'soft drinks', 'energy drinks', 'desserts', 'desert', 'dessert', 'shia pudding', 'chia pudding']);

// Older carts stored only one line per product; its identity must survive removals.
export const lineKey = (item) => item.lineId || `legacy-${item.product_id}`;
export function preparationStation(item) {
    return barCategories.has(String(item.product_category || '').trim().toLowerCase()) || /drink|dessert|desert/i.test(item.product_category || '') ? 'Bar' : 'Kitchen';
}
export function preparationSnapshot(items) {
    return Object.fromEntries(items.map((item, index) => [lineKey(item, index), { qty: item.qty, note: item.note || '' }]));
}
export function pendingPreparation(items, printed = {}) {
    return items.flatMap((item, index) => {
        const previous = printed[lineKey(item, index)];
        // A changed instruction needs a replacement slip for the whole line.
        const qty = !previous || previous.note !== (item.note || '') ? item.qty : Math.max(0, item.qty - previous.qty);
        return qty > 0 ? [{ ...item, qty, noteChanged: !!previous && previous.note !== (item.note || '') }] : [];
    });
}
