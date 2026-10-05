// Reorder visible rows while leaving other groups/categories in their existing slots.
export function reorderVisible(all, visible, key, sourceId, targetId) {
    const ids = new Set(visible.map(row => String(row[key])));
    const from = visible.findIndex(row => String(row[key]) === String(sourceId));
    const to = visible.findIndex(row => String(row[key]) === String(targetId));
    if (from < 0 || to < 0 || from === to) return all;
    const moved = [...visible];
    moved.splice(to, 0, moved.splice(from, 1)[0]);
    let index = 0;
    return all.map(row => ids.has(String(row[key])) ? moved[index++] : row);
}
