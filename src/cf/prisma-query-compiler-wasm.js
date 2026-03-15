// Cloudflare Workers: Prisma's query compiler uses a WASM module which Prisma
// (by default) compiles from base64 at runtime. Workers disallow that form of
// WebAssembly compilation.
//
// Wrangler can precompile `.wasm` to a `WebAssembly.Module` at bundle time
// (wrangler.jsonc rules: CompiledWasm). We then expose it on `globalThis` so
// Prisma's generated client can use it without any runtime compilation.

import wasmModule from '../generated/prisma/internal/query_compiler_bg.postgresql.wasm';

// Only set once, allow other bootstrap code to override if needed.
globalThis.__PRISMA_QUERY_COMPILER_WASM_MODULE ??= wasmModule;
