const express = require('express');
const db = require('../config/database');
const sql = require('../config/dialect');
const router = express.Router();

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
