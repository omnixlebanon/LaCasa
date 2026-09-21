const assert = require('node:assert/strict');
const db = require('../config/database');
const { stockItemInput, saveStockItem } = require('../services/stockItemService');

(async () => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const name = `edit-test-${Date.now()}`;
        const created = await saveStockItem(connection, null, {
            stock_name: name, stock_uom: 'kg', stock_category: 'Test', stock_limit: 5,
            stock_cost: 2.5, stock_shelf_life: 20, stock_supplier: 'Supplier', stock_supplier_contact: '123',
        });
        const read = async () => (await connection.execute('SELECT i.*, s.supplier_name, s.supplier_contact FROM items i LEFT JOIN suppliers s ON s.item_id = i.item_id WHERE i.item_id = ?', [created.item_id]))[0][0];
        assert.equal(Number((await read()).stock), 0);
        assert.equal((await read()).exDate, null);
        await connection.execute("INSERT INTO batches (item_id, batch_stock, batch_exDate) VALUES (?, 3.5, '2099-01-01')", [created.item_id]);
        await connection.execute('UPDATE items SET stock = 3.5 WHERE item_id = ?', [created.item_id]);
        await saveStockItem(connection, created.item_id, {
            stock_name: `${name}-a`, stock_uom: 'liters', stock_category: '', stock_limit: 2.25,
            stock_cost: 0, stock_shelf_life: 0, stock_supplier: '', stock_supplier_contact: '',
        });
        const edited = await read();
        assert.equal(edited.item_name, `${name}-a`);
        assert.equal(edited.uom, 'liters');
        assert.equal(edited.item_category, null);
        assert.equal(Number(edited.safety_limit), 2.25);
        assert.equal(Number(edited.item_cost), 0);
        assert.equal(edited.shelf_life, 0);
        assert.equal(edited.supplier_name, '');
        assert.equal(edited.supplier_contact, '');
        assert.equal(Number(edited.stock), 3.5);
        assert.equal(edited.exDate, '2099-01-01');
        assert.equal(edited.stockStatus, 'well');
        await saveStockItem(connection, created.item_id, { stock_supplier_contact: 'new contact', stock_limit: 10 });
        assert.equal((await read()).stockStatus, 'Low');
        assert.equal((await read()).supplier_contact, 'new contact');
        for (const payload of [{ stock_stock: 100 }, { current_stock: 100 }, { stock_exDate: '2100-01-01' }, { stock_name: '' }, { stock_uom: 'x'.repeat(31) }, { stock_shelf_life: 1.5 }, { stock_limit: -1 }, { stock_cost: Infinity }, { stock_supplier_contact: 'x'.repeat(31) }]) {
            assert.throws(() => stockItemInput(payload), { status: 400 });
        }
        const [[batch]] = await connection.execute('SELECT batch_stock, batch_exDate FROM batches WHERE item_id = ?', [created.item_id]);
        assert.equal(Number(batch.batch_stock), 3.5);
        assert.equal(batch.batch_exDate, '2099-01-01');
        console.log('PASS: zero-stock creation, editable metadata/supplier fields, clearing optional values, numeric validation, derived status, and quantity/expiration protection. Test data rolled back.');
    } finally { await connection.rollback(); connection.release(); await db.end(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
