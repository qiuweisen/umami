export const PRISMA = 'prisma';
export const POSTGRESQL = 'postgresql';
export const CLICKHOUSE = 'clickhouse';
export const KAFKA = 'kafka';
export const KAFKA_PRODUCER = 'kafka-producer';

type HyperdriveBinding = {
  connectionString: string;
};

// Fixes issue with converting bigint values
BigInt.prototype.toJSON = function () {
  return Number(this);
};

export function getDatabaseType(url = process.env.DATABASE_URL) {
  if (!url) {
    const cloudflareContext = (globalThis as any)[Symbol.for('__cloudflare-context__')] as
      | { env?: Record<string, unknown> }
      | undefined;
    const hyperdrive = cloudflareContext?.env?.HYPERDRIVE as HyperdriveBinding | undefined;

    if (hyperdrive?.connectionString) {
      url = hyperdrive.connectionString;
      process.env.DATABASE_URL ??= url;
    }
  }

  const type = url?.split(':')[0];

  if (type === 'postgres') {
    return POSTGRESQL;
  }

  return type;
}

export async function runQuery(queries: any) {
  if (process.env.CLICKHOUSE_URL) {
    if (queries[KAFKA]) {
      return queries[KAFKA]();
    }

    return queries[CLICKHOUSE]();
  }

  const db = getDatabaseType();

  if (db === POSTGRESQL) {
    return queries[PRISMA]();
  }
}

export function notImplemented() {
  throw new Error('Not implemented.');
}
