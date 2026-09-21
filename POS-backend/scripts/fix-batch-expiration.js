const fs = require('node:fs');
const path = require('node:path');
const db = require('../config/database');

// Run from POS-backend: node scripts/fix-batch-expiration.js
// Only derived expiration values and the three expiration triggers are changed.
async function main() {
    const connection = await db.getConnection();
    const events = { insert: 'NEW.item_id', update: 'NEW.item_id OR items.item_id = OLD.item_id', delete: 'OLD.item_id' };
    const originals = [];
    try {
        for (const event of Object.keys(events)) {
            const name = `after_batch_${event}`;
            const [[row]] = await connection.query(`SHOW CREATE TRIGGER \`${name}\``);
            originals.push({ name, statement: row['SQL Original Statement'] });
        }
        const backupPath = path.join(__dirname, `batch-expiration-backup-${Date.now()}.json`);
        fs.writeFileSync(backupPath, JSON.stringify(originals, null, 2));
        console.log(`Original trigger definitions saved to ${backupPath}`);

        try {
            for (const [event, affected] of Object.entries(events)) {
                const name = `after_batch_${event}`;
                await connection.query(`DROP TRIGGER \`${name}\``);
                await connection.query(`CREATE TRIGGER \`${name}\` AFTER ${event.toUpperCase()} ON batches FOR EACH ROW
                    UPDATE items SET exDate = (
                        SELECT MIN(batch_exDate) FROM batches
                        WHERE batches.item_id = items.item_id AND batch_stock > 0
                    ) WHERE items.item_id = ${affected}`);
            }
        } catch (error) {
            for (const original of originals) {
                await connection.query(`DROP TRIGGER IF EXISTS \`${original.name}\``);
                await connection.query(original.statement);
            }
            throw error;
        }

        // Items without batch history retain their manually entered expiration date.
        await connection.beginTransaction();
        const [result] = await connection.query(`UPDATE items i SET exDate = (
            SELECT MIN(b.batch_exDate) FROM batches b WHERE b.item_id = i.item_id AND b.batch_stock > 0
        ) WHERE EXISTS (SELECT 1 FROM batches b WHERE b.item_id = i.item_id)
          AND NOT (i.exDate <=> (SELECT MIN(b.batch_exDate) FROM batches b WHERE b.item_id = i.item_id AND b.batch_stock > 0))`);
        await connection.commit();
        console.log(`Repaired ${result.affectedRows} item expiration dates. Stock quantities were not changed.`);
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally { connection.release(); await db.end(); }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
