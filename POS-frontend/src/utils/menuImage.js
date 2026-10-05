// Resize device photos before upload so menu cards do not download full-size originals.
export async function prepareMenuImage(file) {
    const url = URL.createObjectURL(file);
    try {
        const image = new Image();
        await new Promise((resolve, reject) => {
            image.onload = resolve;
            image.onerror = () => reject(Error('Could not read the selected image.'));
            image.src = url;
        });
        const scale = Math.min(1, 960 / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext('2d');
        if (!context) return file;
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const optimized = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.82));
        return optimized && optimized.size < file.size ? optimized : file;
    } finally { URL.revokeObjectURL(url); }
}
