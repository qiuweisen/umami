import fs from 'node:fs';
import path from 'node:path';

// OpenNext generates `.open-next/worker.js`. We inject a single import at the
// top so Wrangler bundles (and precompiles) Prisma's query compiler wasm, then
// exposes it on `globalThis` for Prisma to consume at runtime.

const workerPath = path.resolve('.open-next/worker.js');
const importLine = 'import "../src/cf/prisma-query-compiler-wasm.js";\n';
const badImportLine = 'import "../src/cf/prisma-query-compiler-wasm.js";\\n';

if (!fs.existsSync(workerPath)) {
  console.log(`[patch-opennext-worker-prisma-wasm] ${workerPath} not found, skipping.`);
  process.exit(0);
}

const input = fs.readFileSync(workerPath, 'utf8');

// If a previous version of this script accidentally wrote a literal `\\n`,
// fix it in-place.
if (input.startsWith(badImportLine)) {
  const fixed = input.replace(badImportLine, importLine);
  fs.writeFileSync(workerPath, fixed);
  console.log(`[patch-opennext-worker-prisma-wasm] fixed newline in ${workerPath}`);
  process.exit(0);
}

if (input.includes('prisma-query-compiler-wasm.js')) {
  console.log('[patch-opennext-worker-prisma-wasm] already patched, skipping.');
  process.exit(0);
}

fs.writeFileSync(workerPath, importLine + input);
console.log(`[patch-opennext-worker-prisma-wasm] patched ${workerPath}`);
