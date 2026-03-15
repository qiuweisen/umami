const REDIS = 'redis';
const enabled = !!process.env.REDIS_URL;

type RedisClient = {
  get: (key: string) => Promise<any>;
  set: (key: string, value: any) => Promise<any>;
  del: (key: string) => Promise<any>;
  expire: (key: string, seconds: number) => Promise<any>;
  fetch: <T>(key: string, fn: () => Promise<T>, ttl?: number) => Promise<T>;
};

let clientPromise: Promise<RedisClient> | null = null;

async function getClient(): Promise<RedisClient> {
  if (!enabled) {
    throw new Error('Redis is not enabled.');
  }

  if (process.env.NODE_ENV !== 'production' && globalThis[REDIS]) {
    return globalThis[REDIS] as RedisClient;
  }

  if (!clientPromise) {
    clientPromise = import('@umami/redis-client').then(({ UmamiRedisClient }) => {
      const redis = new UmamiRedisClient({ url: process.env.REDIS_URL });

      if (process.env.NODE_ENV !== 'production') {
        globalThis[REDIS] = redis;
      }

      return redis as RedisClient;
    });
  }

  return clientPromise;
}

const client: RedisClient = {
  async get(key) {
    return (await getClient()).get(key);
  },
  async set(key, value) {
    return (await getClient()).set(key, value);
  },
  async del(key) {
    return (await getClient()).del(key);
  },
  async expire(key, seconds) {
    return (await getClient()).expire(key, seconds);
  },
  async fetch(key, fn, ttl) {
    return (await getClient()).fetch(key, fn, ttl);
  },
};

export default { client, enabled };
