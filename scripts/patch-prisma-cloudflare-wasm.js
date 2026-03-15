import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import path from 'node:path';

// Cloudflare Workers disallow runtime WebAssembly compilation from bytes.
// Prisma's generated client (engineType=client) compiles a base64-encoded wasm
// module via `new WebAssembly.Module(...)`, which crashes at runtime on Workers.
//
// Fix strategy:
// 1) Materialize the wasm bytes into a real `.wasm` file inside the repo.
// 2) Let Wrangler precompile it at bundle time (rules: CompiledWasm).
// 3) Patch Prisma's generated client to use a precompiled module exposed on
//    `globalThis.__PRISMA_QUERY_COMPILER_WASM_MODULE` when available.

const targetPath = path.resolve('src/generated/prisma/internal/class.ts');
const internalDir = path.dirname(targetPath);
const wasmDestPath = path.join(internalDir, 'query_compiler_bg.postgresql.wasm');

if (!fs.existsSync(targetPath)) {
  console.log(`[patch-prisma-cloudflare-wasm] ${targetPath} not found, skipping.`);
  process.exit(0);
}

const input = fs.readFileSync(targetPath, 'utf8');

// Ensure the .wasm file exists next to the generated Prisma code so it can be imported
// by ES module workers on Cloudflare.
try {
  // Use Prisma's own base64 module as source of truth (it's part of @prisma/client exports).
  // This avoids relying on non-exported files inside the `prisma` package.
  const { wasm } = await import(
    '@prisma/client/runtime/query_compiler_bg.postgresql.wasm-base64.mjs'
  );
  const wasmBytes = Buffer.from(wasm, 'base64');

  fs.mkdirSync(internalDir, { recursive: true });
  fs.writeFileSync(wasmDestPath, wasmBytes);
} catch (e) {
  console.error(
    '[patch-prisma-cloudflare-wasm] Failed to materialize query compiler wasm from @prisma/client base64 module.',
    e,
  );
  process.exit(1);
}

// Idempotency: if we've already patched it, do nothing (but we still copy wasm above).
if (input.includes('__PRISMA_QUERY_COMPILER_WASM_MODULE')) {
  console.log('[patch-prisma-cloudflare-wasm] already patched, skipping.');
  process.exit(0);
}

const needle = [
  '  getQueryCompilerWasmModule: async () => {',
  '    const { wasm } = await import("@prisma/client/runtime/query_compiler_bg.postgresql.wasm-base64.mjs")',
  '    return await decodeBase64AsWasm(wasm)',
  '  }',
].join('\n');

const replacement = [
  '  getQueryCompilerWasmModule: async () => {',
  '    const globalAny = globalThis as any',
  '    const precompiled = globalAny.__PRISMA_QUERY_COMPILER_WASM_MODULE',
  '    if (precompiled) {',
  '      return precompiled as WebAssembly.Module',
  '    }',
  '',
  '    const { wasm } = await import("@prisma/client/runtime/query_compiler_bg.postgresql.wasm-base64.mjs")',
  '',
  '    try {',
  '      return await decodeBase64AsWasm(wasm)',
  '    } catch (e) {',
  '      const message = e instanceof Error ? e.message : String(e)',
  "      if (message.includes('Wasm code generation disallowed')) {",
  '        throw new Error(',
  "          'Prisma query compiler wasm must be precompiled on Cloudflare Workers. ' +",
  "            'Ensure `.open-next/worker.js` imports `src/cf/prisma-query-compiler-wasm.js` (Wrangler precompiles `*.wasm` by default).'",
  '        )',
  '      }',
  '      throw e',
  '    }',
  '  }',
].join('\n');

if (!input.includes(needle)) {
  console.error(
    '[patch-prisma-cloudflare-wasm] Expected Prisma snippet not found. Prisma generator output likely changed.',
  );
  process.exit(1);
}

const output = input.replace(needle, replacement);
fs.writeFileSync(targetPath, output);
console.log(`[patch-prisma-cloudflare-wasm] patched ${targetPath}`);
