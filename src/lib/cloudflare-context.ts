export type CloudflareRequestContext = {
  env: Record<string, unknown>;
  ctx: unknown;
  cf: unknown;
};

const CLOUDFLARE_CONTEXT_SYMBOL = Symbol.for('__cloudflare-context__');

export function getCloudflareContext(): CloudflareRequestContext | undefined {
  return (globalThis as any)[CLOUDFLARE_CONTEXT_SYMBOL] as CloudflareRequestContext | undefined;
}
