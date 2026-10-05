const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { PGlite } = require('@electric-sql/pglite');
const { wrap } = require('../config/postgres');

test('exchange rate is shared across clients and invalid changes preserve the saved rate', async t => {
    const previous = process.env.DATABASE_URL;
    process.env.DATABASE_URL = 'postgres://test';
    const engine = new PGlite();
    await engine.exec('CREATE TABLE pos_settings (setting_key VARCHAR(60) PRIMARY KEY, setting_value TEXT NOT NULL)');
    const db = wrap({ async query(config) {
        const result = await engine.query(config.text, config.values);
        return { ...result, rowCount: result.affectedRows ?? result.rows.length };
    } });
    const path = require.resolve('../config/database');
    const old = require.cache[path];
    require.cache[path] = { id: path, filename: path, loaded: true, exports: db };
    const app = express(); app.use(express.json()); app.use('/api', require('../routes/settingsRout'));
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    t.after(async () => {
        await new Promise(resolve => server.close(resolve)); await engine.close();
        if (old) require.cache[path] = old; else delete require.cache[path];
        if (previous === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previous;
    });
    const url = `http://127.0.0.1:${server.address().port}/api/settings/exchange-rate`;
    const read = async () => (await fetch(url)).json();
    const write = rate => fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rate }) });
    assert.equal((await read()).rate, 89500);
    assert.equal((await write(90000)).status, 200);
    assert.equal((await read()).rate, 90000);
    assert.equal((await write(91000)).status, 200);
    assert.equal((await read()).rate, 91000);
    for (const value of [0, -1, '90000', null]) assert.equal((await write(value)).status, 400);
    assert.equal((await read()).rate, 91000);
});
