const db = require('../config/database.js');
const Sqids = require('sqids').default; 
const crypto = require('crypto'); 

const sqids = new Sqids({               
  minLength: 5
});

async function processOrderCheckout(totalAmount, customerName, details = {}) {
    const connection = await db.getConnection();
    try {
        console.log("\n================ [CHECKOUT DIAGNOSTIC] ================");
        console.log("Customer:", customerName);
        console.log("Total Amount:", totalAmount);
        console.log("Details payload received:", JSON.stringify(details, null, 2));

        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const currentMonthString = `${year}${month}`; 

        await connection.beginTransaction();

        // 1. Generate safe unique ID
        const randomBytes = crypto.randomBytes(6);
        const tempUniqueInt = randomBytes.readUIntBE(0, 6);
        const scrambledSequence = sqids.encode([tempUniqueInt]); 
        const publicOrderId = `${currentMonthString}-${scrambledSequence}`; 

        // 2. Insert order history record
        const insertQuery = `
            INSERT INTO orders_history (order_id, customer_name, total_amount, details)
            VALUES (?, ?, ?, ?);
        `;
        const [insertResult] = await connection.query(insertQuery, [
            publicOrderId,
            customerName,
            totalAmount,
            JSON.stringify(details) 
        ]);
        console.log("Order history record created with internal ID:", insertResult.insertId);

        // 3. DECREASE STOCK OF CONNECTED INGREDIENTS
        // 5. DECREASE STOCK OF CONNECTED INGREDIENTS/ITEMS (RECIPE BILL OF MATERIALS)
        const orderItems = details.items || [];
        console.log(`Processing stock for (${orderItems.length}) products in order.`);

        for (const orderItem of orderItems) {
            if (!orderItem.product_id || !orderItem.qty) continue;

            // Fetch all recipe ingredients associated with this product
            const [recipeIngredients] = await connection.query(
                `SELECT item_id, qty FROM product_items WHERE product_id = ?`,
                [orderItem.product_id]
            );

            // Deduct the corresponding stock quantity for each ingredient
            for (const ingredient of recipeIngredients) {
                let remainingDeduction = orderItem.qty * ingredient.qty;
                const itemId = ingredient.item_id;

                console.log(`\n[FIFO] Deducting Item ID: ${itemId} by ${remainingDeduction} units`);

                // A. Retrieve active batches for this ingredient, sorted by earliest expiration date (FIFO)
                const [activeBatches] = await connection.query(
                    `SELECT batch_id, batch_stock FROM batches 
                     WHERE item_id = ? AND batch_stock > 0 
                     ORDER BY batch_exDate ASC`,
                    [itemId]
                );

                // B. Subtract from batches one by one until the deduction is completed
                for (const batch of activeBatches) {
                    if (remainingDeduction <= 0) break;

                    const currentBatchStock = parseFloat(batch.batch_stock);
                    
                    if (currentBatchStock >= remainingDeduction) {
                        // This batch has enough stock to cover the remaining deduction
                        await connection.query(
                            `UPDATE batches SET batch_stock = batch_stock - ? WHERE batch_id = ?`,
                            [remainingDeduction, batch.batch_id]
                        );
                        console.log(`   Deducted ${remainingDeduction} from Batch ID ${batch.batch_id}. Batch stock is now ${currentBatchStock - remainingDeduction}`);
                        remainingDeduction = 0;
                    } else {
                        // This batch doesn't have enough; empty it completely and move to next batch
                        await connection.query(
                            `UPDATE batches SET batch_stock = 0 WHERE batch_id = ?`,
                            [batch.batch_id]
                        );
                        console.log(`   Emptied Batch ID ${batch.batch_id} (Deducted ${currentBatchStock})`);
                        remainingDeduction -= currentBatchStock;
                    }
                }

                // C. Synchronize the total stock in the 'items' table with the sum of remaining batches
                const updateItemsStockQuery = `
                    UPDATE items 
                    SET stock = (
                        SELECT COALESCE(SUM(batch_stock), 0) 
                        FROM batches 
                        WHERE item_id = ?
                    ) 
                    WHERE item_id = ?;
                `;
                
                const [result] = await connection.query(updateItemsStockQuery, [itemId, itemId]);
                console.log(`   Items stock synchronized. Affected rows: ${result.affectedRows}`);
            }
        }
        // Release a linked table in the same transaction as checkout.
        if (details.table_id) {
            await connection.query("UPDATE tablez SET t_status = 'available' WHERE t_id = ?", [details.table_id]);
        } else if (details.table_name) {
            await connection.query("UPDATE tablez SET t_status = 'available' WHERE t_name = ?", [details.table_name]);
        }
        // 4. Fetch auto-generated timestamp
        const selectQuery = `
            SELECT order_date 
            FROM orders_history 
            WHERE internal_id = ?;
        `;
        const [rows] = await connection.query(selectQuery, [insertResult.insertId]);
        
        if (rows.length === 0) {
            throw new Error("Failed to retrieve generated order metadata.");
        }

        const { order_date } = rows[0];
        
        await connection.commit();

        return {
            success: true,
            orderId: publicOrderId,
            internalId: insertResult.insertId,
            timestamp: order_date
        };

    } catch (error) {
        await connection.rollback();
        console.error("Checkout Transaction Failed:", error);
        return { success: false, error: error.message };
    } finally {
        connection.release();
    }
}

module.exports = processOrderCheckout;
