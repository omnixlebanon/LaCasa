import { defineConfig } from 'vite';
import plugin from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

// Match the public /menu route used by Vercel in local dev and preview.
const serveMenu = (server) => {
    server.middlewares.use((req, res, next) => {
        const pathname = req.url?.split('?')[0];
        if (!['/menu', '/menu/'].includes(pathname)) return next();
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(readFileSync(new URL('./public/menu/index.html', import.meta.url)));
    });
};

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [plugin(), { name: 'public-menu', configureServer: serveMenu, configurePreviewServer: serveMenu }],
    server: {
        port: 49682,
        strictPort:true,
    }
})