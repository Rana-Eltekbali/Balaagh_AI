import { copyFile } from 'node:fs/promises';

// GitHub Pages serves this document for direct visits to client-side routes.
const output = new URL('../dist/public/', import.meta.url);
await copyFile(new URL('index.html', output), new URL('404.html', output));
