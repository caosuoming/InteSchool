import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Immutable Vite assets are reused across deployments and should be compressed
// at build time, not recompressed on the Node.js request path.
const assetsDir = new URL('../dist/assets/', import.meta.url);
let files = 0;
let originalBytes = 0;
let brotliBytes = 0;

for (const name of await readdir(assetsDir)) {
  if (!/\.(?:js|css)$/.test(name)) continue;
  const path = join(fileURLToPath(assetsDir), name);
  const { size } = await stat(path);
  if (size < 1024) continue;
  const contents = await readFile(path);
  const gzip = gzipSync(contents, { level: 9 });
  const brotli = brotliCompressSync(contents, {
    params: {
      [constants.BROTLI_PARAM_QUALITY]: 9,
      [constants.BROTLI_PARAM_SIZE_HINT]: contents.length,
    },
  });
  await Promise.all([
    writeFile(`${path}.gz`, gzip),
    writeFile(`${path}.br`, brotli),
  ]);
  files++;
  originalBytes += size;
  brotliBytes += brotli.length;
}
console.log(`Precompressed ${files} JS/CSS assets: ${originalBytes} -> ${brotliBytes} bytes (Brotli)`);
