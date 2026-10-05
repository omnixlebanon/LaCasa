const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const imageDirectory = path.join(__dirname, '../images/products');
const maxImageBytes = 3 * 1024 * 1024;

function createProductImageStore({ storage, directory = imageDirectory } = {}) {
    async function saveProductImage(data) {
        const match = typeof data === 'string' && /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(data);
        if (!match) throw new Error('Choose a PNG, JPEG, or WebP image.');
        const buffer = Buffer.from(match[2], 'base64');
        if (!buffer.length || buffer.length >= maxImageBytes) throw new Error('Image must be smaller than 3 MB.');
        const valid = match[1] === 'png' ? buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
            : match[1] === 'jpeg' ? buffer.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'))
            : buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP';
        if (!valid) throw new Error('The file does not contain a valid PNG, JPEG, or WebP image.');
        const filename = `${randomUUID()}.${match[1] === 'jpeg' ? 'jpg' : match[1]}`;
        if (storage) return storage.upload(filename, buffer, `image/${match[1]}`);
        await fs.mkdir(directory, { recursive: true });
        await fs.writeFile(path.join(directory, filename), buffer, { flag: 'wx' });
        return `/api/public/product-images/${filename}`;
    }
    return { saveProductImage };
}
let defaultStore;
function getStore() {
    if (!defaultStore) {
        const cloud = process.env.VERCEL || process.env.DATABASE_URL || process.env.SUPABASE_URL || process.env.SUPABASE_SERVICE_ROLE_KEY;
        const storage = cloud ? require('./supabaseImageStorage').createSupabaseImageStorage({
            url: process.env.SUPABASE_URL,
            databaseUrl: process.env.DATABASE_URL,
            serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
            bucket: process.env.SUPABASE_IMAGE_BUCKET || 'menu-images'
        }) : undefined;
        defaultStore = createProductImageStore({ storage });
    }
    return defaultStore;
}
module.exports = { imageDirectory, createProductImageStore, saveProductImage: data => getStore().saveProductImage(data) };
