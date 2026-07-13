jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn(),
}));

import type Redis from 'ioredis';

describe('Redis client', () => {
  const originalRedisUrl = process.env.REDIS_URL;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalAuthServerUrl = process.env.MYCHAMPIONS_AUTH_SERVER_URL;

  afterEach(() => {
    if (originalRedisUrl === undefined) {
      delete process.env.REDIS_URL;
    } else {
      process.env.REDIS_URL = originalRedisUrl;
    }
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
    if (originalAuthServerUrl === undefined) {
      delete process.env.MYCHAMPIONS_AUTH_SERVER_URL;
    } else {
      process.env.MYCHAMPIONS_AUTH_SERVER_URL = originalAuthServerUrl;
    }
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('queues the first command while its lazy Redis connection is starting in development', async () => {
    process.env.NODE_ENV = 'development';
    process.env.REDIS_URL = 'redis://localhost:16379';
    const { default: Redis } = await import('ioredis');
    const connect = jest.fn().mockResolvedValue(undefined);
    const on = jest.fn();
    jest.mocked(Redis).mockImplementation(() => ({ connect, on }) as unknown as Redis);

    const { getRedisClient } = await import('../../cache/redis-client');
    getRedisClient();

    expect(Redis).toHaveBeenCalledWith('redis://localhost:16379', {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      enableOfflineQueue: true,
    });
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it('fails fast when Redis is unavailable in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.MYCHAMPIONS_AUTH_SERVER_URL = 'https://root-server.test';
    process.env.REDIS_URL = 'redis://localhost:16379';
    const { default: Redis } = await import('ioredis');
    const connect = jest.fn().mockResolvedValue(undefined);
    const on = jest.fn();
    jest.mocked(Redis).mockImplementation(() => ({ connect, on }) as unknown as Redis);

    const { getRedisClient } = await import('../../cache/redis-client');
    getRedisClient();

    expect(Redis).toHaveBeenCalledWith('redis://localhost:16379', {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      enableOfflineQueue: false,
    });
  });
});
