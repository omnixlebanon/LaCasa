const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const express = require('express');
const { imageDirectory, saveProductImage } = require('../services/productImages');

test('uploaded image is saved in the images folder and publicly served', async () => {
    const data = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
    const url = await saveProductImage(`data:image/png;base64,${data}`);
    assert.match(url, /^\/api\/public\/product-images\/[a-f0-9-]+\.png$/);
    const filename = path.join(imageDirectory, path.basename(url));
    const app = express();
    app.use('/api/public/product-images', express.static(imageDirectory));
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    try {
        const response = await fetch(`http://127.0.0.1:${server.address().port}${url}`);
        assert.equal(response.status, 200);
        assert.match(response.headers.get('content-type'), /image\/png/);
        assert.deepEqual(Buffer.from(await response.arrayBuffer()), Buffer.from(data, 'base64'));
    } finally {
        await new Promise(resolve => server.close(resolve));
        await fs.unlink(filename);
    }
});

test('rejects unsupported, forged and oversized image uploads', async () => {
    for (const data of [undefined, 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,aGVsbG8=', 'data:image/jpeg;base64,' + Buffer.alloc(3 * 1024 * 1024 + 1).toString('base64')]) {
        await assert.rejects(saveProductImage(data));
    }
});
