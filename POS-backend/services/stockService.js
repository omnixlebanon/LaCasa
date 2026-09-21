const db = require('../config/database');

const getStockSummary = async () => {
    const query = `
        SELECT 
            SUM(item_cost * stock) AS totalValue,
            SUM(CASE WHEN stock <= safety_limit THEN 1 ELSE 0 END) AS refillCount,
            SUM(CASE WHEN exDate IS NOT NULL AND exDate <= CURRENT_DATE THEN 1 ELSE 0 END) AS expiredCount
        FROM items
    `;

    try {
        const [rows] = await db.query(query);
        const row = rows && rows[0] ? rows[0] : {};

        return {
            totalStockValue: parseFloat(row.totalValue) || 0,
            needsRefillCount: parseInt(row.refillCount, 10) || 0,
            expiredItemsCount: parseInt(row.expiredCount, 10) || 0
        };
    } catch (err) {
        console.error("Database error in getStockSummary:", err.message);
        throw err;
    }
};

module.exports = getStockSummary;