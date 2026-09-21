const invalid = message => Object.assign(new Error(message), { status: 400 });
const textFields = { stock_name: ['item_name', true], stock_category: ['item_category', false], stock_uom: ['uom', true], stock_supplier: ['supplier_name', false], stock_supplier_contact: ['supplier_contact', false] };
const numberFields = { stock_limit: 'safety_limit', stock_cost: 'item_cost', stock_shelf_life: 'shelf_life' };

function stockItemInput(body, creating = false) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw invalid('Ingredient details are required.');
    const values = {};
    for (const key of Object.keys(body)) {
        if (Object.hasOwn(textFields, key)) {
            const [column, required] = textFields[key];
            if (typeof body[key] !== 'string' || body[key].trim().length > 30 || (required && !body[key].trim())) throw invalid(`${column.replaceAll('_', ' ')} must ${required ? 'contain 1–30' : 'contain at most 30'} characters.`);
            values[column] = body[key].trim();
        } else if (Object.hasOwn(numberFields, key)) {
            const number = Number(body[key]);
            const shelfLife = key === 'stock_shelf_life';
            if (!['string', 'number'].includes(typeof body[key]) || body[key] === '' || !Number.isFinite(number) || number < 0 ||
                (shelfLife ? !Number.isInteger(number) || number > 2147483647 : number > 99999999.99)) throw invalid(`Invalid ${numberFields[key].replaceAll('_', ' ')}.`);
            values[numberFields[key]] = shelfLife ? number : Math.round((number + Number.EPSILON) * 100) / 100;
        } else {
            throw invalid('Only ingredient and supplier details can be edited here. Change quantities and expiration through batches.');
        }
    }
    if (!Object.keys(values).length) throw invalid('No changes supplied.');
    if (creating && (!values.item_name || !values.uom)) throw invalid('Ingredient name and unit of measure are required.');
    return values;
}

async function saveStockItem(connection, id, body) {
    const values = stockItemInput(body, id === null);
    if (id === null) {
        const [result] = await connection.execute(`INSERT INTO items
            (item_name, item_category, uom, safety_limit, item_cost, shelf_life, stock, stockStatus)
            VALUES (?, ?, ?, ?, ?, ?, 0, 'out of stock')`,
            [values.item_name, values.item_category || null, values.uom, values.safety_limit ?? 0, values.item_cost ?? 0, values.shelf_life ?? 0]);
        id = result.insertId;
    } else {
        if (!Number.isSafeInteger(Number(id)) || Number(id) <= 0) throw invalid('Invalid ingredient ID.');
        const [[item]] = await connection.execute('SELECT item_id FROM items WHERE item_id = ? FOR UPDATE', [id]);
        if (!item) throw Object.assign(new Error('Ingredient not found.'), { status: 404 });
        const entries = Object.entries(values).filter(([column]) => !column.startsWith('supplier_'));
        const assignments = entries.map(([column]) => `${column} = ?`);
        assignments.push("stockStatus = CASE WHEN stock <= 0 THEN 'out of stock' WHEN stock > safety_limit THEN 'well' ELSE 'Low' END");
        await connection.execute(`UPDATE items SET ${assignments.join(', ')} WHERE item_id = ?`,
            [...entries.map(([column, value]) => column === 'item_category' && !value ? null : value), id]);
    }
    if ('supplier_name' in values || 'supplier_contact' in values) {
        const [[supplier]] = await connection.execute('SELECT supplier_name, supplier_contact FROM suppliers WHERE item_id = ?', [id]);
        const name = values.supplier_name ?? supplier?.supplier_name ?? '';
        const contact = values.supplier_contact ?? supplier?.supplier_contact ?? '';
        if (supplier) await connection.execute('UPDATE suppliers SET supplier_name = ?, supplier_contact = ? WHERE item_id = ?', [name, contact, id]);
        else if (name || contact) await connection.execute('INSERT INTO suppliers (item_id, supplier_name, supplier_contact) VALUES (?, ?, ?)', [id, name, contact]);
    }
    return { item_id: Number(id) };
}

module.exports = { stockItemInput, saveStockItem };
