const maxImageBytes = 3 * 1024 * 1024;
const mimeTypes = ['image/png', 'image/jpeg', 'image/webp'];

function storageError(message, code = 'IMAGE_STORAGE_UNAVAILABLE') {
    return Object.assign(new Error(message), { code });
}

function projectUrlFromDatabase(databaseUrl) {
    try {
        const connection = new URL(databaseUrl);
        if (!['postgres:', 'postgresql:'].includes(connection.protocol)) return undefined;
        const direct = /^db\.([a-z0-9]+)\.supabase\.co$/.exec(connection.hostname);
        const pooled = /\.pooler\.supabase\.com$/.test(connection.hostname)
            && /^postgres\.([a-z0-9]+)$/.exec(decodeURIComponent(connection.username));
        const reference = direct?.[1] || pooled?.[1];
        return reference ? `https://${reference}.supabase.co` : undefined;
    } catch { return undefined; }
}

function createSupabaseImageStorage({ url, databaseUrl, serviceRoleKey, bucket = 'menu-images', fetchImpl = fetch } = {}) {
    let project;
    try { project = new URL(url || projectUrlFromDatabase(databaseUrl)); } catch { /* Report configuration without exposing credentials. */ }
    if (!project || project.protocol !== 'https:' || project.username || project.password || project.pathname !== '/' || project.search || project.hash || !serviceRoleKey || !/^[a-zA-Z0-9_-]{1,63}$/.test(bucket)) {
        throw storageError('Image storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the backend.', 'IMAGE_STORAGE_CONFIG');
    }
    const base = `${project.origin}/storage/v1`;
    const headers = { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` };
    async function request(route, options = {}) {
        try {
            return await fetchImpl(base + route, { ...options, headers: { ...headers, ...options.headers }, signal: AbortSignal.timeout(15000), redirect: 'error' });
        } catch {
            throw storageError('Could not reach image storage. Please retry.');
        }
    }
    async function readBucket() {
        const response = await request(`/bucket/${bucket}`);
        const data = await response.json().catch(() => ({}));
        return { response, data };
    }
    function checkBucket({ response, data }) {
        if (!response.ok) throw storageError('Could not access image storage. Check the backend Supabase key and bucket.');
        if (data.public !== true) throw storageError(`The ${bucket} image bucket must be public for menu images.`, 'IMAGE_STORAGE_CONFIG');
    }
    let ready;
    async function ensureBucket() {
        if (!ready) ready = (async () => {
            const existing = await readBucket();
            if (existing.response.ok) return checkBucket(existing);
            if (existing.response.status !== 404 && String(existing.data.statusCode) !== '404') return checkBucket(existing);
            const created = await request('/bucket', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: bucket, name: bucket, public: true, file_size_limit: maxImageBytes - 1, allowed_mime_types: mimeTypes })
            });
            // Another server instance may have created the bucket at the same time.
            if (!created.ok) checkBucket(await readBucket());
        })().catch(error => { ready = undefined; throw error; });
        return ready;
    }
    async function upload(filename, buffer, contentType) {
        await ensureBucket();
        const objectPath = `${bucket}/products/${filename}`;
        const response = await request(`/object/${objectPath}`, {
            method: 'POST', headers: { 'Content-Type': contentType, 'Cache-Control': 'max-age=31536000', 'x-upsert': 'false' }, body: buffer
        });
        if (!response.ok) throw storageError('Could not upload the image to Supabase Storage. Check storage availability and retry.');
        return `${base}/object/public/${objectPath}`;
    }
    return { upload, ensureBucket };
}
module.exports = { createSupabaseImageStorage, projectUrlFromDatabase };
