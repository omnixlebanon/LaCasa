import { useEffect, useId, useRef, useState } from 'react';
import api, { apiAssetUrl } from '../api.js';
import { prepareMenuImage } from '../utils/menuImage.js';

export async function uploadProductImage(file) {
    if (!file) return undefined;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw Error('Choose a PNG, JPEG, or WebP image.');
    if (file.size >= 3 * 1024 * 1024) throw Error('Image must be smaller than 3 MB.');
    const upload = await prepareMenuImage(file);
    const imageData = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(Error('Could not read the selected image.'));
        reader.readAsDataURL(upload);
    });
    const response = await api.post('/api/products/image-upload', { imageData }, { adapter: 'xhr' });
    return response.data.product_image;
}

export default function ProductImageInput({ value = '', file, onChange, onRemove, disabled }) {
    const id = useId();
    const input = useRef(null);
    const [preview, setPreview] = useState('');
    useEffect(() => {
        if (!file) { setPreview(''); return; }
        const url = URL.createObjectURL(file);
        setPreview(url);
        return () => URL.revokeObjectURL(url);
    }, [file]);
    const src = file ? preview : (value.startsWith('imgs/') ? `/menu/${value}` : apiAssetUrl(value));
    return <div className="label-input">
        <label htmlFor={id}>Menu image</label>
        <input ref={input} id={id} type="file" accept="image/png,image/jpeg,image/webp" disabled={disabled} onChange={event => onChange(event.target.files?.[0] || null)} />
        <small>PNG, JPEG, or WebP, under 3 MB. Upload requires a server connection.</small>
        {src && <img src={src} alt="Product image preview" style={{ maxWidth: 180, maxHeight: 140, objectFit: 'contain' }} />}
        {(file || value) && <button type="button" disabled={disabled} onClick={() => {
            input.current.value = '';
            onChange(null);
            onRemove?.();
        }}>Remove image</button>}
    </div>;
}
