const express = require('express');
const db = require('../config/database.js');
const router = express.Router();

// GET all floors
router.get('/seating/floors', async (req, res) => {
    try {
        const query = `
            SELECT 
                f.floor_id, 
                f.floor_name, 
                f.display_order,
                t.t_id, 
                t.t_name, 
                t.t_type, 
                t.t_status, 
                t.t_seats
            FROM floors f
            LEFT JOIN tablez t ON f.floor_id = t.floor_id
            ORDER BY f.display_order ASC, t.t_id ASC
        `;

        const [rows] = await db.query(query);
        const floorsMap = {};
        for (const row of rows) {
            if (!floorsMap[row.floor_id]) {
                floorsMap[row.floor_id] = {
                    floor_id: row.floor_id,
                    floor_name: row.floor_name,
                    display_order: row.display_order,
                    tables: []
                };
            }
            if (row.t_id !== null) {
                floorsMap[row.floor_id].tables.push({
                    t_id: row.t_id,
                    t_name: row.t_name,
                    t_type: row.t_type,
                    t_status: row.t_status,
                    t_seats: row.t_seats,
                    floor_id: row.floor_id
                });
            }
        }

        const floorsList = Object.values(floorsMap).sort((a, b) => a.display_order - b.display_order);
        res.status(200).json(floorsList);
    } catch (error) {
        console.error("Error fetching layouts:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

router.post('/seating/layout', async (req, res) => {
    const { floors } = req.body;
    if (!Array.isArray(floors)) {
        return res.status(400).json({ error: "Invalid payload format. Expected 'floors' array." });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // 1. Determine deleted floors
        const payloadFloorIds = floors.map(f => f.floor_id).filter(id => id > 0);
        const [existingFloors] = await connection.query('SELECT floor_id FROM floors');
        const dbFloorIds = existingFloors.map(f => f.floor_id);

        const floorsToDelete = dbFloorIds.filter(id => !payloadFloorIds.includes(id));
        if (floorsToDelete.length > 0) {
            await connection.query('DELETE FROM floors WHERE floor_id IN (?)', [floorsToDelete]);
        }

        // 2. Determine deleted tables
        const payloadTableIds = [];
        floors.forEach(f => {
            if (f.tables && Array.isArray(f.tables)) {
                f.tables.forEach(t => {
                    if (t.t_id > 0) payloadTableIds.push(t.t_id);
                });
            }
        });

        const [existingTables] = await connection.query('SELECT t_id FROM tablez');
        const dbTableIds = existingTables.map(t => t.t_id);

        const tablesToDelete = dbTableIds.filter(id => !payloadTableIds.includes(id));
        if (tablesToDelete.length > 0) {
            await connection.query('DELETE FROM tablez WHERE t_id IN (?)', [tablesToDelete]);
        }

        // 3. TEMPORARILY RENAME UNIQUE VALUES TO PREVENT COLLISIONS DURING SYNC
        // This appends '_temp' to existing table names and turns display_orders negative.
        await connection.query("UPDATE tablez SET t_name = CONCAT(t_name, '_temp') WHERE t_id > 0");
        await connection.query("UPDATE floors SET display_order = -display_order - 1000 WHERE floor_id > 0");

        const floorIdMapping = {};
        let orderCounter = 1;

        // 4. Process Floor and Table insertions and updates
        for (const floor of floors) {
            let actualFloorId = floor.floor_id;

            if (typeof floor.floor_id === 'number' && floor.floor_id < 0) {
                // Insert brand new floor
                const [result] = await connection.query(
                    'INSERT INTO floors (floor_name, display_order) VALUES (?, ?)',
                    [floor.floor_name, orderCounter++]
                );
                actualFloorId = result.insertId;
                floorIdMapping[floor.floor_id] = actualFloorId;
            } else {
                // Update existing floor (now with correct unique display_order counter)
                await connection.query(
                    'UPDATE floors SET floor_name = ?, display_order = ? WHERE floor_id = ?',
                    [floor.floor_name, orderCounter++, floor.floor_id]
                );
                floorIdMapping[floor.floor_id] = floor.floor_id;
            }

            if (floor.tables && Array.isArray(floor.tables)) {
                for (const table of floor.tables) {
                    const mappedFloorId = floorIdMapping[table.floor_id] || table.floor_id;

                    if (typeof table.t_id === 'number' && table.t_id < 0) {
                        // Insert brand new table
                        await connection.query(
                            'INSERT INTO tablez (floor_id, t_name, t_type, t_status, t_seats) VALUES (?, ?, ?, ?, ?)',
                            [mappedFloorId, table.t_name, table.t_type, table.t_status || 'available', table.t_seats]
                        );
                    } else {
                        // Update existing table details (overwrites temporary '_temp' name)
                        await connection.query(
                            'UPDATE tablez SET floor_id = ?, t_name = ?, t_type = ?, t_status = ?, t_seats = ? WHERE t_id = ?',
                            [mappedFloorId, table.t_name, table.t_type, table.t_status, table.t_seats, table.t_id]
                        );
                    }
                }
            }
        }

        await connection.commit();
        res.status(200).json({ message: "Layout synchronized successfully" });
    } catch (error) {
        await connection.rollback();
        console.error("Transaction rolled back. Sync Error:", error);
        res.status(500).json({ error: error.message || "Failed to synchronize layout changes." });
    } finally {
        connection.release();
    }
});

router.put('/seating/tables/:id/status', async (req, res) => {
    const tableId = req.params.id;
    const { t_status } = req.body;

    if (!t_status) {
        return res.status(400).json({ error: "t_status parameter is required" });
    }

    try {
        const query = 'UPDATE tablez SET t_status = ? WHERE t_id = ?';
        const [result] = await db.query(query, [t_status, tableId]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "Table not found" });
        }

        res.status(200).json({ message: "Table status updated successfully" });
    } catch (error) {
        console.error("Error updating table status by ID:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

router.put('/seating/tables/status', async (req, res) => {
    const { t_name, t_status } = req.body;

    if (!t_name || !t_status) {
        return res.status(400).json({ error: "Both t_name and t_status parameters are required" });
    }

    try {
        const query = 'UPDATE tablez SET t_status = ? WHERE t_name = ?';
        const [result] = await db.query(query, [t_status, t_name]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "Table name not found" });
        }

        res.status(200).json({ message: "Table status updated successfully" });
    } catch (error) {
        console.error("Error updating table status by name:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

module.exports = router;