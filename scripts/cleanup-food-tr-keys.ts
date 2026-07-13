import { getRedisClient } from '../src/cache/redis-client';
import { logger } from '../src/logger';

async function main() {
  const client = getRedisClient();
  if (!client) {
    logger.error('Redis client not available');
    process.exit(1);
  }

  logger.info('Starting food_tr keys cleanup...');

  let cursor = '0';
  let deletedCount = 0;

  do {
    const [nextCursor, keys] = await client.scan(cursor, 'MATCH', 'food_tr:*', 'COUNT', 500);
    cursor = nextCursor;

    if (keys.length > 0) {
      await client.unlink(...keys);
      deletedCount += keys.length;
    }
  } while (cursor !== '0');

  logger.info(`Cleanup complete. Deleted ${deletedCount} food_tr keys.`);
  process.exit(0);
}

main().catch((error) => {
  logger.error({ error }, 'Failed to cleanup food_tr keys');
  process.exit(1);
});
