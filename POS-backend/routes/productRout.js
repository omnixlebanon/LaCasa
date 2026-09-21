const express = require('express');
const router = express.Router();
const db = require('../config/database');

// GET catefories
router.get('/products/categories', async (req,res) => {
    try{
        const [rows] = await db.query(`SELECT * FROM product_categories`);
        res.json(rows);
    }catch (err){
        res.status(500).json({error:"Error getting products categories: " + err.message})
    }
});
// PUT category
router.put('/products/category', async (req, res) => {
    const { old_name, new_name } = req.body;
    if (!old_name || !new_name) {
        return res.status(400).json({ error: "Both old_name and new_name are required" });
    }
    
    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        // Update the category lookup table
        await connection.query(
            `UPDATE product_categories SET p_category_name = ? WHERE p_category_name = ?`,
            [new_name, old_name]
        );

        // Update referencing products (assuming products stores the text category name)
        await connection.query(
            `UPDATE products SET product_category = ? WHERE product_category = ?`,
            [new_name, old_name]
        );

        await connection.commit();
        res.status(200).json({ message: "Category renamed successfully." });
    } catch (err) {
        if (connection) await connection.rollback();
        console.error('Error updating category: ', err.message);
        res.status(500).json({ error: err.message });
    } finally { connection?.release(); }
});
// DELETE category
router.delete('/products/category/:name', async (req, res) => {
    const { name } = req.params;
    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        await connection.query(`DELETE FROM product_categories WHERE p_category_name = ?`, [name]);

        await connection.query(`UPDATE products SET product_category = NULL WHERE product_category = ?`, [name]);

        await connection.commit();
        res.status(200).json({ message: "Category deleted successfully." });
    } catch (err) {
        if (connection) await connection.rollback();
        console.error('Error deleting category: ', err.message);
        res.status(500).json({ error: err.message });
    } finally { connection?.release(); }
});
// GET /products
router.get('/products', async (req, res) => {
    try {
        const [rows] = await db.query(`SELECT * FROM products`);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: "Error getting products: " + err.message });
    }
});

// POST /products
router.post('/products', async (req, res) => {
    const { product_name, product_category, product_price } = req.body;
    
    if (!product_name || !product_category || product_price === undefined) {
        return res.status(400).json({ error: "fields are all required" });
    }

    try {
        const query = `INSERT INTO products(product_name, product_category, product_price) VALUES(?, ?, ?)`;
        const [result] = await db.query(query, [product_name, product_category, product_price]);
        
        console.log('Successfully added product.');
        res.status(201).json({ 
            message: "Successfully added product.",
            insertId: result.insertId
        });
    } catch (err) {
        console.error('Error adding product: ', err.message);
        res.status(500).json({ error: err.message });
    }
});

// PATCH /products/:id
router.patch('/products/:id', async (req, res) => {
    const { id } = req.params;
    const product_name = req.body.product_name || null;
    const product_category = req.body.product_category || null;
    const product_price = req.body.product_price ?? null;

    const query = `
        UPDATE products SET
            product_name = COALESCE(?, product_name),
            product_category = COALESCE(?, product_category),
            product_price = COALESCE(?, product_price)
        WHERE product_id = ?    
    `;

    try {
        const [result] = await db.query(query, [product_name, product_category, product_price, id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Product not found" });
        }
        return res.status(200).json({ message: "Product updated successfully." });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /products/:id
router.delete('/products/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const [result] = await db.query(`DELETE FROM products WHERE product_id = ?`, [id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Product not found" });
        }
        return res.status(200).json({ message: "Product removed successfully" });
    } catch (err) {
        res.status(500).json({ error: "Failed to delete item: " + err.message });
    }
});

// GET /products/summary
router.get('/products/summary', async (req, res) => {
    try {
        const [products] = await db.query("SELECT * FROM products");
        const [recipeItems] = await db.query(`
            SELECT 
                pi.product_id,
                pi.item_id AS id,
                i.item_name AS name,
                pi.qty,
                i.uom,
                i.item_cost
            FROM product_items pi
            JOIN items i ON pi.item_id = i.item_id
        `);

        const recipeMap = {};
        recipeItems.forEach(item => {
            if (!recipeMap[item.product_id]) {
                recipeMap[item.product_id] = [];
            }
            recipeMap[item.product_id].push({
                id: item.id,
                name: item.name,
                qty: parseFloat(item.qty) || 0,
                uom: item.uom,
                item_cost: parseFloat(item.item_cost) || 0
            });
        });

        const summary = products.map(p => {
            const linked = recipeMap[p.product_id] || [];
            const cost = linked.reduce((sum, item) => sum + (item.qty * item.item_cost), 0);
            const price = parseFloat(p.product_price) || 0;
            const profit = price - cost;
            const linkedItemsCleaned = linked.map(({ id, name, qty, uom }) => ({
                id,
                name,
                qty,
                uom
            }));

            return {
                product_id: p.product_id,
                product_name: p.product_name,
                product_category: p.product_category,
                product_price: price,
                cost: parseFloat(cost.toFixed(2)),
                profit: parseFloat(profit.toFixed(2)),
                linked_items: linkedItemsCleaned
            };
        });

        res.json(summary);
    } catch (err) {
        console.error("Error executing products summary in JS:", err.message);
        res.status(500).json({ error: "Error getting product summary: " + err.message });
    }
});
module.exports = router;
