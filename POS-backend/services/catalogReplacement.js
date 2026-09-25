function validateMenu(menu) {
  if (!Array.isArray(menu) || !menu.length) throw new Error('Menu must contain products.');
  const names = new Set();
  for (const row of menu) {
    if (typeof row.productName !== 'string' || !row.productName.trim() || row.productName.length > 120 || !row.category || row.category.length > 30 || !Number.isFinite(row.price) || row.price < 0) throw new Error('Invalid menu record.');
    const key = row.productName.trim().toLowerCase();
    if (names.has(key)) throw new Error('Duplicate product name: ' + row.productName);
    names.add(key);
  }
}
async function replaceCatalog(connection, menu, previous) {
  validateMenu(menu);
  const categories = [...new Set(menu.map(row => row.category))];
  const keep = new Set();
  let inserted = 0, updated = 0;
  for (const category of categories) {
    const existing = previous.categories.find(row => row.p_category_name.toLowerCase() === category.toLowerCase());
    if (existing) await connection.execute('UPDATE product_categories SET p_category_name = ?, pos_hidden = 0 WHERE p_category_id = ?', [category, existing.p_category_id]);
    else await connection.execute('INSERT INTO product_categories (p_category_name, pos_hidden) VALUES (?, 0)', [category]);
  }
  for (const row of menu) {
    const match = previous.products.find(product => !keep.has(String(product.product_id)) && product.product_category?.toLowerCase() === row.category.toLowerCase() && [row.productName.toLowerCase(), row.name.toLowerCase()].includes(product.product_name.trim().toLowerCase()));
    if (match) {
      await connection.execute('UPDATE products SET product_name = ?, product_category = ?, product_price = ?, product_description = ?, product_image = ?, pos_hidden = 0 WHERE product_id = ?', [row.productName, row.category, row.price.toFixed(2), row.description, row.image, match.product_id]);
      keep.add(String(match.product_id)); updated++;
    } else {
      // Remove a conflicting old name before inserting its replacement; IDs are never recycled.
      const conflicting = previous.products.find(product => !keep.has(String(product.product_id)) && product.product_name.trim().toLowerCase() === row.productName.toLowerCase());
      if (conflicting) { await connection.execute('DELETE FROM product_items WHERE product_id = ?', [conflicting.product_id]); await connection.execute('DELETE FROM products WHERE product_id = ?', [conflicting.product_id]); }
      const [result] = await connection.execute('INSERT INTO products (product_name, product_category, product_price, product_description, product_image, pos_hidden) VALUES (?, ?, ?, ?, ?, 0)', [row.productName, row.category, row.price.toFixed(2), row.description, row.image]);
      keep.add(String(result.insertId)); inserted++;
    }
  }
  for (const row of previous.products) if (!keep.has(String(row.product_id))) {
    await connection.execute('DELETE FROM product_items WHERE product_id = ?', [row.product_id]);
    await connection.execute('DELETE FROM products WHERE product_id = ?', [row.product_id]);
  }
  for (const row of previous.categories) if (!categories.some(name => name.toLowerCase() === row.p_category_name.toLowerCase())) await connection.execute('DELETE FROM product_categories WHERE p_category_id = ?', [row.p_category_id]);
  const [saved] = await connection.query('SELECT product_id, product_name, product_category, product_price FROM products');
  const [savedCategories] = await connection.query('SELECT p_category_name FROM product_categories');
  if (saved.length !== menu.length || savedCategories.length !== categories.length || menu.some(row => !saved.some(product => product.product_name === row.productName && product.product_category === row.category && Number(product.product_price) === row.price))) throw new Error('Catalog verification failed. Replacement will be rolled back.');
  return { products: saved.length, categories: savedCategories.length, inserted, updated, removed: previous.products.filter(row => !keep.has(String(row.product_id))).length };
}
module.exports = { validateMenu, replaceCatalog };
