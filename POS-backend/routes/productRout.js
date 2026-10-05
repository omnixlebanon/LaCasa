const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { requireManagement } = require('../middleware/auth');
router.post('/products/image-upload', requireManagement, async (req, res) => {
    try {
        const product_image = await require('../services/productImages').saveProductImage(req.body?.imageData);
        res.status(201).json({ product_image });
    } catch (error) {
        res.status(error.code ? 500 : 400).json({ error: error.code ? 'Could not save image to the images folder.' : error.message });
    }
});
function validateMenuDetails(body) {
    if (body.product_name !== undefined) {
        if (typeof body.product_name !== 'string' || !body.product_name.trim() || body.product_name.trim().length > 120) return 'Product name must contain 1?120 characters.';
        body.product_name = body.product_name.trim();
    }
    if (body.product_description !== undefined && (typeof body.product_description !== 'string' || body.product_description.length > 2000)) return 'Description must be at most 2000 characters.';
    if (body.product_image !== undefined) {
        const image = body.product_image;
        if (typeof image !== 'string' || image.length > 255) return 'Image URL must be at most 255 characters.';
        if (image && !/^https:\/\/[^\s]+$/i.test(image) && !/^(?:\/menu\/)?imgs\/[a-zA-Z0-9_./ -]+$/.test(image) && !/^\/api\/public\/product-images\/[a-f0-9-]+\.(png|jpg|webp)$/.test(image)) return 'Use an HTTPS image URL or a menu image path.';
    }
    return null;
}


// Visibility controls both the POS and public menu; records and sales history stay intact.
for (const [route, table, key] of [['/products/:id/visibility', 'products', 'product_id'], ['/products/categories/:id/visibility', 'product_categories', 'p_category_id']]) {
  router.patch(route, requireManagement, async (req, res) => {
    if (typeof req.body?.hidden !== 'boolean' || !/^[1-9]\d*$/.test(req.params.id) || !Number.isSafeInteger(Number(req.params.id))) return res.status(400).json({ error: 'Provide a valid ID and hidden boolean.' });
    try {
      const [[record]] = await db.query(`SELECT ${key} FROM ${table} WHERE ${key} = ?`, [req.params.id]);
      if (!record) return res.status(404).json({ error: 'Product or category not found.' });
      await db.query(`UPDATE ${table} SET pos_hidden = ? WHERE ${key} = ?`, [req.body.hidden ? 1 : 0, req.params.id]);
      res.json({ success: true });
    } catch (error) { console.error('Visibility update failed:', error); res.status(500).json({ error: 'Could not update POS visibility. Check the product visibility migration has run.' }); }
  });
}

router.get('/products/groups', async(req,res)=>{
 try{res.json((await db.query('SELECT * FROM menu_groups ORDER BY menu_position, group_id'))[0]);}catch{res.status(503).json({error:'Menu groups are not set up. Run the menu-groups migration.'});}
});
router.post('/products/groups',requireManagement,async(req,res)=>{
 const name=String(req.body.group_name||'').trim();if(!name||name.length>60)return res.status(400).json({error:'Group name must contain 1-60 characters.'});
 try{const [result]=await db.query('INSERT INTO menu_groups (group_name) VALUES (?)',[name]);res.status(201).json({insertId:result.insertId});}catch(e){res.status(422).json({error:'Could not add group. Its name may already exist.'});}
});
router.patch('/products/groups/:id',requireManagement,async(req,res)=>{
 const name=String(req.body.group_name||'').trim();if(!name||name.length>60)return res.status(400).json({error:'Group name must contain 1-60 characters.'});
 try{const [result]=await db.query('UPDATE menu_groups SET group_name = ? WHERE group_id = ?',[name,req.params.id]);res.status(result.affectedRows?200:404).json(result.affectedRows?{success:true}:{error:'Group not found.'});}catch{res.status(422).json({error:'Could not rename group. Its name may already exist.'});}
});
router.delete('/products/groups/:id',requireManagement,async(req,res)=>{
 let connection;try{connection=await db.getConnection();await connection.beginTransaction();await connection.query('UPDATE product_categories SET menu_group_id = NULL WHERE menu_group_id = ?',[req.params.id]);await connection.query('DELETE FROM menu_groups WHERE group_id = ?',[req.params.id]);await connection.commit();res.json({success:true});}catch{if(connection)await connection.rollback();res.status(500).json({error:'Could not delete group.'});}finally{connection?.release();}
});
router.patch('/products/categories/:id/group',requireManagement,async(req,res)=>{
 const id=req.body.menu_group_id;
 if(id!==null&&(!Number.isSafeInteger(id)||id<=0))return res.status(400).json({error:'Choose a valid group.'});
 try{if(id!==null&&!(await db.query('SELECT group_id FROM menu_groups WHERE group_id = ?',[id]))[0].length)return res.status(404).json({error:'Group no longer exists.'});const [result]=await db.query('UPDATE product_categories SET menu_group_id = ? WHERE p_category_id = ?',[id,req.params.id]);res.status(result.affectedRows?200:404).json(result.affectedRows?{success:true}:{error:'Category not found.'});}catch{res.status(500).json({error:'Could not assign category.'});}
});

// Both lists are validated before any positions change; durableSync wraps the write.
router.put('/products/menu-order', requireManagement, async (req, res) => {
    const { kind, entries } = req.body || {};
    const key = kind === 'groups' ? 'group_id' : kind === 'categories' ? 'p_category_id' : 'product_id';
    if (!['groups', 'categories', 'products'].includes(kind) || !Array.isArray(entries) || entries.length > 10000 || entries.some(row => !Number.isSafeInteger(row?.[key]) || row[key] <= 0) || new Set(entries.map(row => row[key])).size !== entries.length) return res.status(400).json({error:'Provide a valid ordered list without duplicates.'});
    const table = kind === 'groups' ? 'menu_groups' : kind === 'categories' ? 'product_categories' : 'products';
    let connection;
    try {
        connection = await db.getConnection(); await connection.beginTransaction();
        const [rows] = await connection.query(`SELECT ${key} FROM ${table}`);
        const ids = new Set(rows.map(row => Number(row[key])));
        if (ids.size !== entries.length || entries.some(row => !ids.has(row[key]))) {
            await connection.rollback(); return res.status(409).json({error:'The catalog changed. Refresh and reorder the current list.'});
        }
        for (const [index, row] of entries.entries()) await connection.query(`UPDATE ${table} SET menu_position = ? WHERE ${key} = ?`, [index, row[key]]);
        await connection.commit(); res.json({success:true});
    } catch (error) {
        if (connection) await connection.rollback();
        res.status(500).json({error:'Could not save menu order. Ensure the menu-order migration has run.'});
    } finally { connection?.release(); }
});

// GET catefories
router.get('/products/categories', async (req,res) => {
    try{
        const [rows] = await db.query(`SELECT * FROM product_categories ${req.query.scope === 'pos' ? 'WHERE pos_hidden = 0' : ''} ORDER BY menu_position, p_category_id`);
        res.json(rows);
    }catch (err){
        res.status(500).json({error:"Error getting products categories: " + err.message})
    }
});
router.post('/products/category', requireManagement, async (req,res) => {
    const name=String(req.body?.category_name||'').trim();
    if(!name||name.length>30)return res.status(400).json({error:'Category name must contain 1–30 characters.'});
    try {
        const [result]=await db.query('INSERT INTO product_categories (p_category_name) VALUES (?)',[name]);
        res.status(201).json({insertId:result.insertId});
    } catch(error) { res.status(['23505','ER_DUP_ENTRY'].includes(error.code)?409:500).json({error:'Could not create category. The name may already exist.'}); }
});
// PUT category
router.put('/products/category', requireManagement, async (req, res) => {
    const old_name=String(req.body.old_name||'').trim(),new_name=String(req.body.new_name||'').trim();
    if(new_name.length>30)return res.status(400).json({error:'Category name must be at most 30 characters.'});
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
router.delete('/products/category/:name', requireManagement, async (req, res) => {
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
        const [rows] = await db.query(`SELECT p.*, COALESCE(c.pos_hidden, 0) AS category_hidden FROM products p LEFT JOIN product_categories c ON c.p_category_name = p.product_category ${req.query.scope === 'pos' ? 'WHERE p.pos_hidden = 0 AND COALESCE(c.pos_hidden, 0) = 0' : ''} ORDER BY c.menu_position, c.p_category_id, p.menu_position, p.product_id`);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: "Error getting products: " + err.message });
    }
});

// POST /products
router.post('/products', requireManagement, async (req, res) => {
    const issue = validateMenuDetails(req.body);
    if (issue) return res.status(400).json({ error: issue });
    const { product_name, product_category, product_price, product_description = '', product_image = '' } = req.body;
    
    if (!product_name || !product_category || product_price === undefined) {
        return res.status(400).json({ error: "fields are all required" });
    }

    try {
        const query = `INSERT INTO products(product_name, product_category, product_price, product_description, product_image) VALUES(?, ?, ?, ?, ?)`;
        const [result] = await db.query(query, [product_name, product_category, product_price, product_description, product_image]);
        
        console.log('Successfully added product.');
        res.status(201).json({ 
            message: "Successfully added product.",
            insertId: result.insertId
        });
    } catch (err) {
        if (['23505','ER_DUP_ENTRY'].includes(err.code)) return res.status(422).json({code:'PRODUCT_NAME_EXISTS',error:'A product with this name already exists. Edit the existing product or choose a different name.'});
        console.error('Error adding product: ', err.message);
        res.status(500).json({ error: err.message });
    }
});

// PATCH /products/:id
router.patch('/products/:id', requireManagement, async (req, res) => {
    const { id } = req.params;
    const issue = validateMenuDetails(req.body);
    if (issue) return res.status(400).json({ error: issue });
    const product_name = req.body.product_name || null;
    const product_category = req.body.product_category || null;
    const product_price = req.body.product_price ?? null;

    const query = `
        UPDATE products SET
            product_name = COALESCE(?, product_name),
            product_category = COALESCE(?, product_category),
            product_price = COALESCE(?, product_price),
            product_description = COALESCE(?, product_description),
            product_image = COALESCE(?, product_image)
        WHERE product_id = ?    
    `;

    try {
        const [result] = await db.query(query, [product_name, product_category, product_price, req.body.product_description ?? null, req.body.product_image ?? null, id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Product not found" });
        }
        return res.status(200).json({ message: "Product updated successfully." });
    } catch (err) {
        if (['23505','ER_DUP_ENTRY'].includes(err.code)) return res.status(422).json({code:'PRODUCT_NAME_EXISTS',error:'A product with this name already exists. Choose a different name.'});
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
