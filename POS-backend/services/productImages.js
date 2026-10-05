const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const imageDirectory = path.join(__dirname, '../images/products');
const maxImageBytes = 3 * 1024 * 1024;

async function saveProductImage(data) {
    const match = typeof data === 'string' && /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(data);
    if (!match) throw new Error('Choose a PNG, JPEG, or WebP image.');
    const buffer = Buffer.from(match[2], 'base64');
    if (!buffer.length || buffer.length > maxImageBytes) throw new Error('Image must be smaller than 3 MB.');
    const valid = match[1] === 'png' ? buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
        : match[1] === 'jpeg' ? buffer.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'))
        : buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP';
    if (!valid) throw new Error('The file does not contain a valid PNG, JPEG, or WebP image.');
    const filename = `${randomUUID()}.${match[1] === 'jpeg' ? 'jpg' : match[1]}`;
    await fs.mkdir(imageDirectory, { recursive: true });
    await fs.writeFile(path.join(imageDirectory, filename), buffer, { flag: 'wx' });
    return `/api/public/product-images/${filename}`;
}
module.exports = { imageDirectory, saveProductImage };
