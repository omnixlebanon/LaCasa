const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { PGlite } = require('@electric-sql/pglite');
const { wrap } = require('../config/postgres');
const { validate } = require('../services/menuAppearance');

test('appearance rejects unsafe IDs, unsupported themes and invalid badges', () => {
    const valid = { theme: 'christmas', decorations: true, badges: { 1: ['christmas','new'] } };
    assert.equal(validate(valid), null);
    for (const value of [null, {...valid,theme:'<script>'}, {...valid,decorations:'true'}, {...valid,badges:[]}, {...valid,badges:{'-1':['new']}}, {...valid,badges:{'9007199254740992':['new']}}, {...valid,badges:{1:['unknown']}}, {...valid,badges:{1:['new','new']}}, {...valid,badges:{1:'new'}}]) assert.ok(validate(value));
});

test('appearance persists for other clients, enforces management access and exposes only visible item badges', async t => {
    const previous = process.env.DATABASE_URL;
    process.env.DATABASE_URL = 'postgres://test';
    const engine = new PGlite();
    await engine.exec(`CREATE TABLE pos_settings(setting_key VARCHAR(60) PRIMARY KEY,setting_value TEXT NOT NULL);
        CREATE TABLE menu_groups(group_id integer PRIMARY KEY,group_name text,menu_position integer);
        CREATE TABLE product_categories(p_category_id integer PRIMARY KEY,p_category_name text,menu_group_id integer,pos_hidden integer,menu_position integer);
        CREATE TABLE products(product_id integer PRIMARY KEY,product_name text,product_category text,product_price numeric,product_description text,product_image text,pos_hidden integer,menu_position integer);
        INSERT INTO product_categories VALUES(1,'Drinks',NULL,0,1),(2,'Private',NULL,1,2);
        INSERT INTO products VALUES(1,'Coffee','Drinks',3,'','',0,1),(2,'Hidden','Drinks',4,'','',1,2),(3,'Private drink','Private',4,'','',0,3);`);
    const db = wrap({ async query(config) { const result = await engine.query(config.text,config.values);return {...result,rowCount:result.affectedRows??result.rows.length}; } });
    const path = require.resolve('../config/database'), old = require.cache[path];
    require.cache[path] = { id:path,filename:path,loaded:true,exports:db };
    const app=express();app.use(express.json());app.use((req,res,next)=>{req.user={access_level:req.get('x-role')||'admin'};next();});
    app.use('/api',require('../routes/settingsRout'));app.use('/public',require('../routes/publicMenuRout'));
    const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
    t.after(async()=>{await new Promise(resolve=>server.close(resolve));await engine.close();if(old)require.cache[path]=old;else delete require.cache[path];if(previous===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=previous;});
    const base=`http://127.0.0.1:${server.address().port}`;
    const request=(method='GET',body,role='admin')=>fetch(base+'/api/settings/menu-appearance',{method,headers:{'Content-Type':'application/json','x-role':role},body:body&&JSON.stringify(body)});
    assert.deepEqual(await (await request()).json(),{theme:'default',decorations:true,badges:{}});
    for(const role of ['employee','payroll_only']) {assert.equal((await request('GET',undefined,role)).status,403);assert.equal((await request('PUT',{theme:'default',decorations:true,badges:{}},role)).status,403);}
    for(const theme of ['christmas','ramadan','halloween','new-year','default']) {
        const value={theme,decorations:false,badges:{1:['new','most-popular','limited-time'],2:['christmas'],3:['ramadan']}};
        assert.equal((await request('PUT',value,'manager')).status,200);
        assert.deepEqual(await(await request('GET',undefined,'owner')).json(),value);
        const response=await fetch(base+'/public/menu');assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
        const menu=await response.json();assert.deepEqual(menu.appearance,{...value,badges:{1:value.badges[1]}});assert.deepEqual(menu.products.map(p=>p.product_id),[1]);
    }
    const before=await(await request()).json();
    assert.equal((await request('PUT',{...before,theme:'invalid'})).status,400);
    assert.equal((await request('PUT',{...before,badges:{999:['new']}})).status,400);
    assert.deepEqual(await(await request()).json(),before);
    // Deleted products must not leave an invisible stale badge that blocks future saves.
    await db.query('DELETE FROM products WHERE product_id = ?', [2]);
    const cleaned=await(await request()).json();
    assert.equal(cleaned.badges[2],undefined);
    assert.equal((await request('PUT',cleaned)).status,200);
    assert.equal((await request('PUT',{theme:'default',decorations:true,badges:{}})).status,200);
    assert.deepEqual((await(await fetch(base+'/public/menu')).json()).appearance.badges,{});
});
