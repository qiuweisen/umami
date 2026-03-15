import { hash, secret } from '../crypto';

const CF_CONTEXT = Symbol.for('__cloudflare-context__');

describe('secret()', () => {
  const originalAppSecret = process.env.APP_SECRET;
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalContext = (globalThis as any)[CF_CONTEXT];

  afterEach(() => {
    process.env.APP_SECRET = originalAppSecret;
    process.env.DATABASE_URL = originalDatabaseUrl;

    if (originalContext === undefined) {
      delete (globalThis as any)[CF_CONTEXT];
    } else {
      (globalThis as any)[CF_CONTEXT] = originalContext;
    }
  });

  test('prefers APP_SECRET when set', () => {
    process.env.APP_SECRET = 'test-app-secret';
    process.env.DATABASE_URL = 'postgresql://should-not-be-used';

    expect(secret()).toBe(hash('test-app-secret'));
  });

  test('falls back to Hyperdrive connectionString when DATABASE_URL is missing (Cloudflare)', () => {
    delete process.env.APP_SECRET;
    delete process.env.DATABASE_URL;

    const connectionString = 'postgresql://user:pass@host:5432/db';
    (globalThis as any)[CF_CONTEXT] = {
      env: { HYPERDRIVE: { connectionString } },
      ctx: {},
      cf: {},
    };

    expect(secret()).toBe(hash(connectionString));
    // secret() should pin it for this isolate to avoid auth flakiness.
    expect(process.env.DATABASE_URL).toBe(connectionString);
  });
});
