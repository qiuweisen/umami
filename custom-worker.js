/**
 * Entry point in front of the OpenNext worker (Workers CPU reduction, 2026-10-18).
 * CORS preflight (OPTIONS) for the collection endpoints is answered here with the
 * same headers next.config.ts applies to /api/*, so it no longer boots Next.js.
 * Everything else is passed to OpenNext unchanged.
 */
import openNextWorker from './.open-next/worker.js';

const PREFLIGHT_PATHS = new Set(['/api/send', '/api/batch']);

export function preflightResponse() {
  return new Response(null, {
    status: 204,
    headers: {
      allow: 'OPTIONS, POST',
      'access-control-allow-origin': '*',
      'access-control-allow-headers': '*',
      'access-control-allow-methods': 'GET, DELETE, POST, PUT',
      'access-control-max-age': '86400',
      'cache-control': 'no-cache',
    },
  });
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS' && PREFLIGHT_PATHS.has(new URL(request.url).pathname)) {
      return preflightResponse();
    }
    return openNextWorker.fetch(request, env, ctx);
  },
};
