function createBlobImageStorage({ token, putImpl } = {}) {
    if (!token) throw Object.assign(new Error('Set BLOB_READ_WRITE_TOKEN on the backend to enable image uploads.'), { code: 'IMAGE_STORAGE_CONFIG' });
    return {
        async upload(filename, buffer, contentType) {
            try {
                const put = putImpl || (await import('@vercel/blob')).put;
                const blob = await put(`menu/products/${filename}`, buffer, {
                    token, access: 'public', contentType,
                    addRandomSuffix: false, allowOverwrite: false,
                    cacheControlMaxAge: 31536000
                });
                return blob.url;
            } catch {
                throw Object.assign(new Error('Could not upload the image to Vercel Blob. Check the backend token and that the Blob store is public, then retry.'), { code: 'IMAGE_STORAGE_UNAVAILABLE' });
            }
        }
    };
}
module.exports = { createBlobImageStorage };
