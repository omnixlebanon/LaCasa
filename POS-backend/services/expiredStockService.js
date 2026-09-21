const failure = (message, status = 400) => Object.assign(new Error(message), { status });

async function listExpiredBatches(connection) {
    const [rows] = await connection.execute(`SELECT b.batch_id, b.item_id, b.batch_stock, b.batch_exDate, i.item_name, i.uom
        FROM batches b JOIN items i ON i.item_id = b.item_id
        WHERE b.batch_stock > 0 AND b.batch_exDate < CURRENT_DATE
        ORDER BY i.item_name, b.batch_exDate, b.batch_id`);
    return rows;
}

// Caller owns the transaction. Only the batches in the reviewed preview are changed.
async function discardExpiredBatches(connection, selected) {
    if (!Array.isArray(selected) || !selected.length || selected.length > 1000 || selected.some(batch =>
        !Number.isSafeInteger(batch.batch_id) || batch.batch_id <= 0 ||
        !Number.isFinite(Number(batch.batch_stock)) || Number(batch.batch_stock) <= 0 ||
        typeof batch.batch_exDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(batch.batch_exDate))) {
        throw failure('Select valid expired batches to remove.');
    }
    const ids = selected.map(batch => batch.batch_id).sort((a, b) => a - b);
    if (new Set(ids).size !== ids.length) throw failure('Duplicate batches are not allowed.');
    const placeholders = ids.map(() => '?').join(',');
    // Lock parent items before batches, matching stock-usage operations.
    await connection.execute(`SELECT item_id FROM items WHERE item_id IN
        (SELECT item_id FROM batches WHERE batch_id IN (${placeholders})) ORDER BY item_id FOR UPDATE`, ids);
    const [rows] = await connection.execute(`SELECT batch_id, item_id, batch_stock, batch_exDate FROM batches
        WHERE batch_id IN (${placeholders}) AND batch_stock > 0 AND batch_exDate < CURRENT_DATE
        ORDER BY batch_id FOR UPDATE`, ids);
    const preview = new Map(selected.map(batch => [batch.batch_id, batch]));
    if (rows.length !== ids.length || rows.some(row =>
        Number(row.batch_stock) !== Number(preview.get(row.batch_id).batch_stock) ||
        row.batch_exDate !== preview.get(row.batch_id).batch_exDate)) {
        throw failure('Stock changed since the preview. Close this window and review the expired stock again.', 409);
    }
    await connection.execute(`UPDATE batches SET batch_stock = 0 WHERE batch_id IN (${placeholders})`, ids);
    const itemIds = [...new Set(rows.map(row => row.item_id))];
    for (const itemId of itemIds) {
        const [[totals]] = await connection.execute(`SELECT COALESCE(SUM(batch_stock), 0) AS stock,
            MIN(CASE WHEN batch_stock > 0 THEN batch_exDate END) AS exDate FROM batches WHERE item_id = ?`, [itemId]);
        await connection.execute(`UPDATE items SET stock = ?, exDate = ?, stockStatus = CASE
            WHEN ? <= 0.0 THEN 'out of stock' WHEN ? > safety_limit THEN 'well' ELSE 'Low' END WHERE item_id = ?`,
            [totals.stock, totals.exDate, totals.stock, totals.stock, itemId]);
    }
    return { removedBatches: rows.length, affectedItems: itemIds.length };
}

module.exports = { listExpiredBatches, discardExpiredBatches };
