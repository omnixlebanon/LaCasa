import fs from 'node:fs/promises';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import config from '../tailwind.config.js';

// Keep a regular CSS artifact so Sales also styles correctly in an already running dev server.
const result = await postcss([tailwind(config), autoprefixer]).process(
    '@tailwind base;\n@tailwind utilities;', { from: undefined }
);
await fs.writeFile(new URL('../src/page/sales/SalesUtilities.css', import.meta.url), result.css);
