const assert = require('node:assert/strict');
const db = require('../config/database');
const { listExpiredBatches, discardExpiredBatches } = require('../services/expiredStockService');

(async () => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const [item] = await connection.execute("INSERT INTO items (item_name, uom, stock, safety_limit) VALUES (?, 'unit', 17, 5)", [`discard-test-${Date.now()}`]);
        const itemId = item.insertId;
        await connection.execute(`INSERT INTO batches (item_id, batch_stock, batch_exDate) VALUES
            (?, 3, '2001-01-01'), (?, 4, '2002-01-01'), (?, 2, CURDATE()), (?, 5, '2099-12-31'), (?, 3, NULL), (?, 0, '2000-01-01')`, Array(6).fill(itemId));
        const preview = (await listExpiredBatches(connection)).filter(row => row.item_id === itemId);
        assert.equal(preview.length, 2);
        assert.equal(preview.reduce((sum, row) => sum + Number(row.batch_stock), 0), 7);
        await assert.rejects(discardExpiredBatches(connection, [preview[0], preview[0]]), { status: 400 });
        await assert.rejects(discardExpiredBatches(connection, [{ ...preview[0], batch_stock: 999 }]), { status: 409 });
        const [[future]] = await connection.execute("SELECT batch_id, batch_stock, batch_exDate FROM batches WHERE item_id = ? AND batch_exDate = '2099-12-31'", [itemId]);
        await assert.rejects(discardExpiredBatches(connection, [future]), { status: 409 });
        assert.deepEqual(await discardExpiredBatches(connection, preview), { removedBatches: 2, affectedItems: 1 });
        const [[updated]] = await connection.execute('SELECT stock, stockStatus, exDate, CURDATE() AS today FROM items WHERE item_id = ?', [itemId]);
        assert.equal(Number(updated.stock), 10);
        assert.equal(updated.stockStatus, 'well');
        assert.equal(updated.exDate, updated.today);
        const [remaining] = await connection.execute('SELECT batch_stock FROM batches WHERE item_id = ? AND batch_stock > 0 ORDER BY batch_stock', [itemId]);
        assert.deepEqual(remaining.map(row => Number(row.batch_stock)), [2, 3, 5]);
        await assert.rejects(discardExpiredBatches(connection, preview), { status: 409 });
        assert.equal((await listExpiredBatches(connection)).filter(row => row.item_id === itemId).length, 0);
        console.log('PASS: exact preview removal; today, future and undated stock preserved; totals/date updated; stale, duplicate, unexpired and repeated requests rejected.');
    } finally { await connection.rollback(); connection.release(); await db.end(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
