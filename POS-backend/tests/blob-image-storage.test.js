const test = require('node:test');
const assert = require('node:assert/strict');
const { createBlobImageStorage } = require('../services/blobImageStorage');
const { createProductImageStore } = require('../services/productImages');
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';

test('validated menu images upload to public Blob and return a permanent URL', async () => {
    const calls = [];
    const storage = createBlobImageStorage({ token: 'test-server-token', putImpl: async (...args) => {
        calls.push(args);
        return { url: 'https://test.public.blob.vercel-storage.com/' + args[0] };
    } });
    const store = createProductImageStore({ storage });
    const first = await store.saveProductImage('data:image/png;base64,' + png);
    const second = await store.saveProductImage('data:image/png;base64,' + png);
    assert.notEqual(first, second);
    assert.match(first, /^https:\/\/test\.public\.blob\.vercel-storage\.com\/menu\/products\/[a-f0-9-]+\.png$/);
    assert.deepEqual(calls[0][1], Buffer.from(png, 'base64'));
    assert.equal(calls[0][2].access, 'public');
    assert.equal(calls[0][2].token, 'test-server-token');
    assert.equal(calls[0][2].contentType, 'image/png');
    assert.equal(calls[0][2].allowOverwrite, false);
    await assert.rejects(store.saveProductImage('data:image/png;base64,aGVsbG8='));
    assert.equal(calls.length, 2);
});

test('storage failures do not expose the Blob token', async () => {
    assert.throws(() => createBlobImageStorage(), { code: 'IMAGE_STORAGE_CONFIG' });
    const storage = createBlobImageStorage({ token: 'secret-token', putImpl: async () => { throw Error('secret-token'); } });
    await assert.rejects(storage.upload('test.png', Buffer.from(png, 'base64'), 'image/png'), error => {
        assert.equal(error.code, 'IMAGE_STORAGE_UNAVAILABLE');
        assert.equal(error.message.includes('secret-token'), false);
        return true;
    });
});
