const test = require('node:test');
const assert = require('node:assert/strict');
const { createSupabaseImageStorage } = require('../services/supabaseImageStorage');
const { createProductImageStore } = require('../services/productImages');
const config = { url: 'https://test-project.supabase.co', serviceRoleKey: 'server-only-test-key' };
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';

test('creates a public image bucket, uploads device bytes in products/, and returns cacheable public URLs', async () => {
    const calls = [];
    const storage = createSupabaseImageStorage({ ...config, fetchImpl: async (url, options) => {
        calls.push({ url, options });
        if (options.method !== 'POST') return Response.json({ statusCode: '404' }, { status: 400 });
        return Response.json({});
    } });
    const store = createProductImageStore({ storage, directory: '/unwritable-folder' });
    const first = await store.saveProductImage(`data:image/png;base64,${png}`);
    const second = await store.saveProductImage(`data:image/png;base64,${png}`);
    assert.match(first, /^https:\/\/test-project\.supabase\.co\/storage\/v1\/object\/public\/menu-images\/products\/[a-f0-9-]+\.png$/);
    assert.notEqual(first, second);
    assert.equal(calls.length, 4);
    const bucket = JSON.parse(calls[1].options.body);
    assert.deepEqual(bucket, { id: 'menu-images', name: 'menu-images', public: true, file_size_limit: 3145727, allowed_mime_types: ['image/png', 'image/jpeg', 'image/webp'] });
    const upload = calls[2];
    assert.equal(upload.url, first.replace('/object/public/', '/object/'));
    assert.deepEqual(upload.options.body, Buffer.from(png, 'base64'));
    assert.equal(upload.options.headers['Content-Type'], 'image/png');
    assert.equal(upload.options.headers['Cache-Control'], 'max-age=31536000');
    assert.equal(upload.options.headers['x-upsert'], 'false');
    assert.equal(upload.options.headers.Authorization, `Bearer ${config.serviceRoleKey}`);
    assert.equal(first.includes(config.serviceRoleKey), false);
    await assert.rejects(store.saveProductImage('data:image/png;base64,aGVsbG8='));
    assert.equal(calls.length, 4);
});

test('does not change a private bucket or attempt uploads with rejected credentials', async () => {
    for (const response of [Response.json({ public: false }), Response.json({ statusCode: '403', message: config.serviceRoleKey }, { status: 403 })]) {
        const calls = [];
        const storage = createSupabaseImageStorage({ ...config, fetchImpl: async (url, options) => { calls.push(options); return response; } });
        await assert.rejects(storage.upload('test.png', Buffer.from(png, 'base64'), 'image/png'), error => {
            assert.match(error.code, /^IMAGE_STORAGE_/);
            assert.equal(error.message.includes(config.serviceRoleKey), false);
            return true;
        });
        assert.equal(calls.length, 1);
        assert.equal(calls[0].method, undefined);
    }
});

test('handles concurrent bucket creation and retries transient storage failures', async () => {
    let calls = 0;
    const storage = createSupabaseImageStorage({ ...config, fetchImpl: async () => {
        calls++;
        if (calls === 1) throw Error('network down');
        if (calls === 2) return Response.json({ statusCode: '404' }, { status: 400 });
        if (calls === 3) return Response.json({ statusCode: '409' }, { status: 409 });
        return Response.json({ public: true });
    } });
    await assert.rejects(storage.ensureBucket(), /Could not reach/);
    await storage.ensureBucket();
    assert.equal(calls, 4);
});

test('reports upload failures and rejects missing or unsafe storage configuration', async () => {
    const storage = createSupabaseImageStorage({ ...config, fetchImpl: async (url, options) => options.method === 'POST'
        ? Response.json({ message: config.serviceRoleKey }, { status: 500 }) : Response.json({ public: true }) });
    await assert.rejects(storage.upload('test.png', Buffer.from(png, 'base64'), 'image/png'), /Could not upload/);
    for (const options of [{}, { ...config, url: 'http://test-project.supabase.co' }, { ...config, bucket: '../private' }, { ...config, url: 'https://test-project.supabase.co/other' }]) {
        assert.throws(() => createSupabaseImageStorage(options), error => error.code === 'IMAGE_STORAGE_CONFIG');
    }
});
