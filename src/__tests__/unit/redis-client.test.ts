jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn(),
}));

import Redis from 'ioredis';

describe('Redis client', () => {
  const originalRedisUrl = process.env.REDIS_URL;

  afterEach(() => {
    if (originalRedisUrl === undefined) {
      delete process.env.REDIS_URL;
    } else {
      process.env.REDIS_URL = originalRedisUrl;
    }
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('queues the first command while its lazy Redis connection is starting', async () => {
    process.env.REDIS_URL = 'redis://localhost:16379';
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
});
