const db = require('./database'); // This imports your exported MySQL pool

const categories = [
  { key: 1, name: "Bakery & Flour" },
  { key: 2, name: "Fresh Meats" },
  { key: 3, name: "Fresh Produce" },
  { key: 4, name: "Dairy & Fats" },
  { key: 5, name: "Dry Goods & Grains" },
  { key: 6, name: "Spices & Oils" },
  { key: 7, name: "Packaging" },
  { key: 8, name: "Beverages" },
  { key: 9, name: "Sauces & Condiments" },
  { key: 10, name: "Canned Goods" }
];

const initialItems = [
  { id: 1, name: "Premium White Flour", category: "Bakery & Flour", stock: 150, uom: "kg", limit: 50, cost: 1.10, stockStatus: "well", shelf_life: 180 },
  { id: 2, name: "Beef Ribeye (Local)", category: "Fresh Meats", stock: 35, uom: "kg", limit: 15, cost: 14.50, stockStatus: "well", shelf_life: 5 },
  { id: 3, name: "Local Vine Tomatoes", category: "Fresh Produce", stock: 40, uom: "kg", limit: 10, cost: 0.85, stockStatus: "well", shelf_life: 7 },
  { id: 4, name: "Whole Milk 3.5%", category: "Dairy & Fats", stock: 60, uom: "L", limit: 20, cost: 1.40, stockStatus: "well", shelf_life: 10 },
  { id: 5, name: "Extra Virgin Olive Oil", category: "Spices & Oils", stock: 50, uom: "L", limit: 15, cost: 8.50, stockStatus: "well", shelf_life: 365 },
  { id: 6, name: "Fine Sea Salt", category: "Dry Goods & Grains", stock: 25, uom: "kg", limit: 5, cost: 0.40, stockStatus: "well", shelf_life: 730 },
  { id: 7, name: "Green Cardamom Ground", category: "Spices & Oils", stock: 2.5, uom: "kg", limit: 0.5, cost: 24.00, stockStatus: "well", shelf_life: 365 },
  { id: 8, name: "Biodegradable Burger Boxes", category: "Packaging", stock: 500, uom: "pcs", limit: 100, cost: 0.15, stockStatus: "well", shelf_life: 0 },
  { id: 9, name: "Local Sparkling Water 330ml", category: "Beverages", stock: 120, uom: "pcs", limit: 48, cost: 0.55, stockStatus: "well", shelf_life: 365 },
  { id: 10, name: "Tahini Paste", category: "Sauces & Condiments", stock: 30, uom: "kg", limit: 10, cost: 4.20, stockStatus: "well", shelf_life: 180 }
];

const suppliers = [
  { id: 1, item_id: 1, name: "Beirut Modern Flour Mills", contact: "+961 1 511 123" },
  { id: 2, item_id: 2, name: "Al-Tazaj Butchery", contact: "+961 70 244 567" },
  { id: 3, item_id: 3, name: "Bekaa Valley Produce Wholesale", contact: "+961 8 540 890" },
  { id: 4, item_id: 4, name: "Taanayel Dairy Farms", contact: "+961 1 888 444" }
];

const batches = [
  { batch_id: 1, item_id: 1, batch_stock: 50, batch_exDate: "2026-08-15" },
  { batch_id: 2, item_id: 1, batch_stock: 100, batch_exDate: "2026-11-20" },
  { batch_id: 3, item_id: 2, batch_stock: 35, batch_exDate: "2026-07-18" },
  { batch_id: 4, item_id: 3, batch_stock: 40, batch_exDate: "2026-07-20" },
  { batch_id: 5, item_id: 4, batch_stock: 60, batch_exDate: "2026-07-23" },
  { batch_id: 6, item_id: 5, batch_stock: 50, batch_exDate: "2027-04-10" },
  { batch_id: 7, item_id: 6, batch_stock: 25, batch_exDate: "2028-01-01" },
  { batch_id: 8, item_id: 7, batch_stock: 2.5, batch_exDate: "2027-03-14" },
  { batch_id: 9, item_id: 8, batch_stock: 500, batch_exDate: "2035-12-31" },
  { batch_id: 10, item_id: 9, batch_stock: 120, batch_exDate: "2027-05-30" },
  { batch_id: 11, item_id: 10, batch_stock: 30, batch_exDate: "2026-12-15" }
];

const products = [
  { product_id: 1, product_name: "Signature Beef Burger Platter", product_category: "Main Course", product_price: 18.50 },
  { product_id: 2, product_name: "Freshly Baked House Bread (Loaf)", product_category: "Bakery", product_price: 3.00 },
  { product_id: 3, product_name: "Premium Grilled Ribeye Steak", product_category: "Main Course", product_price: 32.00 }
];

const product_items = [
  { product_id: 1, item_id: 1, qty: 0.12 },
  { product_id: 1, item_id: 2, qty: 0.20 },
  { product_id: 1, item_id: 3, qty: 0.08 },
  { product_id: 1, item_id: 4, qty: 0.05 },
  { product_id: 2, item_id: 1, qty: 0.50 },
  { product_id: 2, item_id: 5, qty: 0.02 },
  { product_id: 3, item_id: 2, qty: 0.35 },
  { product_id: 3, item_id: 6, qty: 0.01 }
];

async function seedDatabase() {
  const connection = await db.getConnection();
  console.log("Starting unified MySQL database seeding...");

  try {
    await connection.beginTransaction();
    //Item Categories Seed
    const catQuery = "INSERT IGNORE INTO item_categories (i_category_id, i_category_name) VALUES (?, ?)";
    for (const cat of categories) {
      await connection.execute(catQuery, [cat.key, cat.name]);
    }
    // Items Seed
    const itemQuery = `
            INSERT IGNORE INTO items (item_id, item_name, item_category, stock, uom, safety_limit, item_cost, stockStatus, shelf_life) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
    for (const item of initialItems) {
      await connection.execute(itemQuery, [item.id, item.name, item.category, item.stock, item.uom, item.limit, item.cost, item.stockStatus, item.shelf_life]);
    }

    // Suppliers Seed
    const supplierQuery = "INSERT IGNORE INTO suppliers (id, item_id, supplier_name, supplier_contact) VALUES (?, ?, ?, ?)";
    for (const sup of suppliers) {
      await connection.execute(supplierQuery, [sup.id, sup.item_id, sup.name, sup.contact]);
    }

    // Batches Seed
    const batchQuery = "INSERT IGNORE INTO batches (batch_id, item_id, batch_stock, batch_exDate) VALUES (?, ?, ?, ?)";
    for (const batch of batches) {
      await connection.execute(batchQuery, [batch.batch_id, batch.item_id, batch.batch_stock, batch.batch_exDate]);
    }

    // Products Seed
    const productQuery = "INSERT IGNORE INTO products (product_id, product_name, product_category, product_price) VALUES (?, ?, ?, ?)";
    for (const product of products) {
      await connection.execute(productQuery, [product.product_id, product.product_name, product.product_category, product.product_price]);
    }

    // Product Items Seed
    const piQuery = "INSERT IGNORE INTO product_items (product_id, item_id, qty) VALUES (?, ?, ?)";
    for (const pi of product_items) {
      await connection.execute(piQuery, [pi.product_id, pi.item_id, pi.qty]);
    }
    await connection.commit();
    console.log("All data entities successfully written to MySQL disk!");

  } catch (error) {
    console.error("Transaction failed! Rolling back changes...", error.message);
    await connection.rollback();
  } finally {
    connection.release();
  }
}

seedDatabase();
