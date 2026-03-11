import Redis from 'ioredis';
import { config } from '../config';
import { logger } from '../logger';

let redisClient: Redis | null | undefined;

export function getRedisClient(): Redis | null {
  if (redisClient !== undefined) {
    return redisClient;
  }

  if (!config.redisUrl) {
    redisClient = null;
    logger.warn('REDIS_URL is not configured; translation cache is disabled');
    return redisClient;
  }

  const client = new Redis(config.redisUrl, {
    maxRetriesPerRequest: 1,
    lazyConnect: true,
    enableOfflineQueue: false,
  });

  client.on('error', (error: unknown) => {
    logger.warn({ error }, 'Redis client error');
  });

  client.connect().catch((error: unknown) => {
    logger.warn({ error }, 'Failed to connect to Redis');
  });

  redisClient = client;
  return redisClient;
}
