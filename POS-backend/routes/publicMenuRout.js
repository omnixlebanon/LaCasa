const router = require('express').Router();
const db = require('../config/database');
router.get('/menu', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
        const [products] = await db.query(`SELECT p.product_id, p.product_name, p.product_category,
            p.product_price, p.product_description, p.product_image
            FROM products p LEFT JOIN product_categories c ON c.p_category_name = p.product_category
            WHERE p.pos_hidden = 0 AND COALESCE(c.pos_hidden, 0) = 0
            ORDER BY c.menu_position, c.p_category_id, p.menu_position, p.product_id`);
        res.json({ products });
    } catch (error) {
        console.error('Public menu load failed:', error.message);
        res.status(503).json({ error: 'Menu is temporarily unavailable. Please try again.' });
    }
});
module.exports = router;
