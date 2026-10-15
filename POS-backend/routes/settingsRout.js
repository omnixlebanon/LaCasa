const express = require('express');
const db = require('../config/database');
const sql = require('../config/dialect');
const router = express.Router();
const appearance = require('../services/menuAppearance');
const { requireManagement } = require('../middleware/auth');

router.get('/settings/menu-appearance', requireManagement, async (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    try {
        const value = await appearance.read(db);
        const [products] = await db.query('SELECT product_id FROM products');
        const known = new Set(products.map(product => String(product.product_id)));
        value.badges = Object.fromEntries(Object.entries(value.badges).filter(([id]) => known.has(id)));
        res.json(value);
    } catch (error) { next(error); }
});
router.put('/settings/menu-appearance', requireManagement, async (req, res, next) => {
    const error = appearance.validate(req.body);
    if (error) return res.status(400).json({ error });
    try {
        const ids = Object.keys(req.body.badges);
        if (ids.length) {
            const [products] = await db.query('SELECT product_id FROM products');
            const known = new Set(products.map(product => String(product.product_id)));
            if (ids.some(id => !known.has(id))) return res.status(400).json({ error: 'An item no longer exists. Reload before saving.' });
        }
        const value = { theme: req.body.theme, decorations: req.body.decorations, badges: req.body.badges };
        await db.query(`INSERT INTO pos_settings (setting_key, setting_value) VALUES (?, ?) ${sql(
            'ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)',
            'ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value'
        )}`, ['menu_appearance', JSON.stringify(value)]);
        res.json(value);
    } catch (error) { next(error); }
});

router.get('/settings/exchange-rate', async (req, res, next) => {
    try {
        const [[row]] = await db.query('SELECT setting_value FROM pos_settings WHERE setting_key = ?', ['exchange_rate']);
        res.json({ rate: row ? Number(row.setting_value) : 89500 });
    } catch (error) { next(error); }
});
router.put('/settings/exchange-rate', async (req, res, next) => {
    const rate = req.body?.rate;
    if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) return res.status(400).json({ error: 'Enter an exchange rate greater than zero.' });
    try {
        await db.query(`INSERT INTO pos_settings (setting_key, setting_value) VALUES (?, ?) ${sql(
            'ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)',
            'ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value'
        )}`, ['exchange_rate', String(rate)]);
        res.json({ rate });
    } catch (error) { next(error); }
});
module.exports = router;
