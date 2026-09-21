const assert = require('node:assert/strict');
const db = require('../config/database');

(async () => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const [item] = await connection.execute("INSERT INTO items (item_name, uom, stock) VALUES (?, 'unit', 12)", [`expiry-test-${Date.now()}`]);
        const itemId = item.insertId;
        const insertBatch = async (qty, date) => (await connection.execute('INSERT INTO batches (item_id, batch_stock, batch_exDate) VALUES (?, ?, ?)', [itemId, qty, date]))[0].insertId;
        const expiry = async () => (await connection.execute('SELECT exDate FROM items WHERE item_id = ?', [itemId]))[0][0].exDate;
        const first = await insertBatch(2, '2001-01-01');
        const second = await insertBatch(10, '2099-12-31');
        assert.equal(await expiry(), '2001-01-01', 'Remaining expired stock must display its date, not N/A');
        await connection.execute('UPDATE batches SET batch_stock = 0 WHERE batch_id = ?', [first]);
        assert.equal(await expiry(), '2099-12-31', 'Exhausting the first batch must select the second batch date');
        await connection.execute('UPDATE batches SET batch_stock = batch_stock - 3 WHERE batch_id = ?', [second]);
        assert.equal(await expiry(), '2099-12-31', 'Partially using the second batch must retain its date');
        await insertBatch(0, '2000-01-01');
        assert.equal(await expiry(), '2099-12-31', 'Empty batches must never affect expiration');
        await connection.execute('DELETE FROM batches WHERE batch_id = ?', [second]);
        assert.equal(await expiry(), null, 'No remaining stock means no batch expiration');
        await insertBatch(5, '2098-12-31');
        assert.equal(await expiry(), '2098-12-31', 'Restocking must restore the expiration date');
        console.log('PASS: expired stock, batch transition, partial use, empty batches, deletion, and restocking.');
    } finally {
        await connection.rollback();
        connection.release();
        await db.end();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
