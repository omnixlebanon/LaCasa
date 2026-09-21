const sql = require('../config/dialect');
const express = require("express");
const router = express.Router();
const db = require('../config/database');
const getStockSummary = require('../services/stockService')
const { saveStockItem } = require('../services/stockItemService');
const { requireManager } = require('../middleware/auth');
const { listExpiredBatches, discardExpiredBatches } = require('../services/expiredStockService');

router.get('/stock/expired-batches', requireManager, async (req, res) => {
    try { res.json(await listExpiredBatches(db)); }
    catch (error) { res.status(500).json({ error: error.message }); }
});

router.post('/stock/discard-expired', requireManager, async (req, res) => {
    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();
        const result = await discardExpiredBatches(connection, req.body?.batches);
        await connection.commit();
        res.json(result);
    } catch (error) {
        if (connection) await connection.rollback();
        res.status(error.status || 500).json({ error: error.message });
    } finally { connection?.release(); }
});

async function refreshStaticExDate(connection, itemId) {
    const query = `
        UPDATE items 
        SET exDate = (
            SELECT MIN(batch_exDate)
            FROM batches
            WHERE batches.item_id = ? AND batches.batch_stock > 0
        )
        WHERE item_id = ?
    `;
    await connection.execute(query, [itemId, itemId]);
}
// GET CATEGORIES
router.get('/stock/categories', async (req, res) => {
    try {
        const [rows] = await db.execute("SELECT * FROM item_categories");
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// CREATE ITEM CATEGORY
router.post('/stock/categories', async (req, res) => {
    const name = req.body?.i_category_name;
    if (typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: 'Category name is required.' });
    }

    try {
        const [existing] = await db.execute(
            'SELECT i_category_id FROM item_categories WHERE i_category_name = ?', [name.trim()]
        );
        if (existing.length) {
            return res.status(409).json({ error: 'Category already exists.' });
        }
        const [result] = await db.execute(
            'INSERT INTO item_categories (i_category_name) VALUES (?)', [name.trim()]
        );
        return res.status(201).json({ i_category_id: result.insertId, i_category_name: name.trim() });
    } catch (err) {
        return res.status(err.code === 'ER_DUP_ENTRY' ? 409 : 500).json({ error: err.message });
    }
});

// Rename/delete categories and their item references on the same connection.
async function changeItemCategory(req, res, deleting) {
    const { id } = req.params;
    if (!/^[1-9]\d*$/.test(id)) {
        return res.status(400).json({ error: 'A valid category ID is required.' });
    }
    const name = req.body?.i_category_name;
    if (!deleting && (typeof name !== 'string' || !name.trim())) {
        return res.status(400).json({ error: 'Category name is required.' });
    }

    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();
        const [rows] = await connection.execute(
            'SELECT i_category_name FROM item_categories WHERE i_category_id = ? FOR UPDATE', [id]
        );
        if (!rows.length) {
            await connection.rollback();
            return res.status(404).json({ error: 'Category not found.' });
        }
        if (!deleting) {
            const [existing] = await connection.execute(
                'SELECT i_category_id FROM item_categories WHERE i_category_name = ? AND i_category_id <> ?',
                [name.trim(), id]
            );
            if (existing.length) {
                await connection.rollback();
                return res.status(409).json({ error: 'Category already exists.' });
            }
            await connection.execute(
                'UPDATE item_categories SET i_category_name = ? WHERE i_category_id = ?', [name.trim(), id]
            );
        }
        await connection.execute(
            'UPDATE items SET item_category = ? WHERE item_category = ?',
            [deleting ? null : name.trim(), rows[0].i_category_name]
        );
        if (deleting) {
            await connection.execute('DELETE FROM item_categories WHERE i_category_id = ?', [id]);
        }
        await connection.commit();
        return res.status(200).json({ message: deleting ? 'Category deleted successfully.' : 'Category renamed successfully.' });
    } catch (err) {
        if (connection) await connection.rollback();
        return res.status(err.code === 'ER_DUP_ENTRY' ? 409 : 500).json({ error: err.message });
    } finally {
        if (connection) connection.release();
    }
}

router.put('/stock/categories/:id', (req, res) => changeItemCategory(req, res, false));
router.delete('/stock/categories/:id', (req, res) => changeItemCategory(req, res, true));

// GET ITEMS 
router.get('/items', async (req, res) => {
    try {
        const query = `
            SELECT i.*, s.supplier_name, s.supplier_contact 
            FROM items i
            LEFT JOIN suppliers s ON i.item_id = s.item_id
        `;
        const [rows] = await db.execute(query);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET STOCK SUMMARY
router.get("/stock/summary", async (req, res) => {
    try {
        const summary = await getStockSummary();
        res.status(200).json(summary);
    } catch (error) {
        console.error("Error fetching summary calculations:", error.message);
        res.status(500).json({ error: "Internal server calculation error" });
    }
});

// Ingredient metadata never changes batch quantities or their expiration dates.
async function saveIngredient(req, res, creating) {
    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();
        const result = await saveStockItem(connection, creating ? null : req.params.id, req.body);
        await connection.commit();
        res.status(creating ? 201 : 200).json({ ...result, message: creating ? 'Ingredient created. Add stock through batches.' : 'Ingredient details saved.' });
    } catch (error) {
        if (connection) await connection.rollback();
        res.status(error.code === 'ER_DUP_ENTRY' ? 409 : error.status || 500).json({ error: error.code === 'ER_DUP_ENTRY' ? 'An ingredient with this name already exists.' : error.message });
    } finally { connection?.release(); }
}
router.post('/items', (req, res) => saveIngredient(req, res, true));
router.patch('/stock/:id/edit', (req, res) => saveIngredient(req, res, false));

// DELETE STOCK ITEM 
router.delete('/stock/:id/delete', async (req, res) => {
    const { id } = req.params;
    try {
        const [result] = await db.execute('DELETE FROM items WHERE item_id = ?', [id]);
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Item not found" });
        }
        return res.status(200).json({ message: "Item and associated supplier/batch rows removed successfully" });
    } catch (err) {
        res.status(500).json({ error: "Failed to delete item: " + err.message });
    }
});

// CREATE A BATCH
router.post('/stock/:id/batch', async (req, res) => {
    const { id } = req.params;
    const batch_stock = parseFloat(req.body.batch_stock);

    if (isNaN(batch_stock) || batch_stock <= 0) {
        return res.status(400).json({ error: "Valid numeric stock quantity greater than 0 is required." });
    }

    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();
        const insertBatchQuery = `
            INSERT INTO batches (item_id, batch_stock, batch_exDate)
            VALUES (?, ?, ${sql(`DATE_ADD(CURRENT_DATE, INTERVAL COALESCE((SELECT shelf_life FROM items WHERE item_id = ?), 0) DAY)`, `(CURRENT_DATE + COALESCE((SELECT shelf_life FROM items WHERE item_id = ?), 0))`)})
        `;
        await connection.execute(insertBatchQuery, [id, batch_stock, id]);

        const updateItemQuery = `
            UPDATE items
            SET stock = stock + ?,
                stockStatus = CASE
                    WHEN (stock + ?) = 0 THEN 'out of stock'
                    WHEN (stock + ?) > safety_limit THEN 'well'
                    ELSE 'Low'
                END
            WHERE item_id = ?
        `;
        await connection.execute(updateItemQuery, [batch_stock, batch_stock, batch_stock, id]);
        await refreshStaticExDate(connection, id);
        await connection.commit();
        return res.status(201).json({ message: "Batch logged and item quantities updated successfully." });

    } catch (err) {
        await connection.rollback();
        return res.status(500).json({ error: "Failed to execute transaction: " + err.message });
    } finally {
        connection.release();
    }
});

// GET RECIPES
router.get('/stock/recipe', async (req, res) => {
    try {
        const [rows] = await db.execute("SELECT * FROM product_items");
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ADD INGREDIENT TO RECIPE
router.post('/stock/recipe/:id', async (req, res) => {
    const { id } = req.params;
    const { item_id, qty } = req.body;
    
    if (!id || !item_id) {
        return res.status(400).json({ error: "Missing required fields: (id) and (item id) are mandatory." });
    }
    
    const finalQty = Number(qty) || 0;
    const query = `INSERT INTO product_items (product_id, item_id, qty) VALUES (?, ?, ?)`;
    
    try {
        await db.execute(query, [id, item_id, finalQty]);
        console.log('Successfully added item to recipe');
        return res.status(201).json({ message: "Successfully added item to recipe" });
    } catch (err) {
        console.error('Error adding item to recipe: ', err.message);
        return res.status(500).json({ error: err.message });
    }
});

// UPDATE INGREDIENT 
router.patch('/stock/recipe/:id', async (req, res) => {
    const { id } = req.params;
    const { linked_items } = req.body;

    if (!Array.isArray(linked_items)) {
        return res.status(400).json({ error: "Invalid data format. Expected linked_items array." });
    }

    const invalidItems = linked_items.some(item => {
        const qtyNum = parseFloat(item.qty);
        return isNaN(qtyNum) || qtyNum <= 0;
    });
    if (invalidItems) {
        return res.status(400).json({ error: "Validation Failed: All ingredient quantities must be greater than 0." });
    }
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const updateQuery = `UPDATE product_items SET qty = ? WHERE product_id = ? AND item_id = ?`;

        for (const item of linked_items) {
            const cleanQty = parseFloat(item.qty);
            await connection.execute(updateQuery, [cleanQty, id, item.id]);
        }

        await connection.commit();
        return res.status(200).json({ message: "Recipe updated successfully" });

    } catch (err) {
        await connection.rollback();
        console.error("Database recipe update error:", err.message);
        return res.status(500).json({ error: "Failed to update recipe values: " + err.message });
    } finally {
        connection.release();
    }
});

// DELETE INGREDIENT FROM RECIPE
router.delete('/stock/recipe/:product_id/:item_id', async (req, res) => {
    const { product_id, item_id } = req.params;

    try {
        const query = "DELETE FROM product_items WHERE product_id = ? AND item_id = ?";
        const [result] = await db.execute(query, [product_id, item_id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Recipe association not found" });
        }
        return res.status(200).json({
            message: "Recipe item association deleted successfully",
            product_id,
            item_id
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

module.exports = router;
