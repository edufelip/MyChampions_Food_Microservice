import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { Client } from 'pg';
import { FOOD_CATALOG_PRUNE_SQL, FOOD_CATALOG_SCHEMA_SQL } from './catalog-persistence-schema';
import { assertCatalogSnapshotSafeForPrune } from './catalog-snapshot-prune-guard';
import { buildFoodCatalogSnapshotRows } from './food-catalog-snapshot';
import { RedisSnapshotEntry, RedisSnapshotType, RedisSnapshotValue } from './redis-snapshot-types';

const REDIS_PATTERN = 'catalog:*';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function readRedisValue(redis: Redis, key: string, type: RedisSnapshotType): Promise<RedisSnapshotValue> {
  if (type === 'string') {
    return redis.get(key);
  }
  if (type === 'hash') {
    return redis.hgetall(key);
  }
  if (type === 'set') {
    return redis.smembers(key);
  }
  if (type === 'zset') {
    const raw = await redis.zrange(key, 0, -1, 'WITHSCORES');
    const members = [];
    for (let index = 0; index < raw.length; index += 2) {
      members.push({ member: raw[index] as string, score: Number(raw[index + 1]) || 0 });
    }
    return members;
  }
  if (type === 'list') {
    return redis.lrange(key, 0, -1);
  }
  return null;
}

async function readRedisSnapshot(redisUrl: string): Promise<RedisSnapshotEntry[]> {
  const redis = new Redis(redisUrl, {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
  });
  await redis.connect();

  try {
    const entries: RedisSnapshotEntry[] = [];
    let cursor = '0';
    do {
      const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', REDIS_PATTERN, 'COUNT', 500);
      cursor = nextCursor;
      for (const key of keys.sort()) {
        const type = await redis.type(key) as RedisSnapshotType;
        const [ttlMs, value] = await Promise.all([
          redis.pttl(key),
          readRedisValue(redis, key, type),
        ]);
        entries.push({ key, type, ttlMs, value });
      }
    } while (cursor !== '0');
    return entries;
  } finally {
    redis.disconnect();
  }
}

async function upsertSnapshot(client: Client, entries: RedisSnapshotEntry[], runId: string): Promise<void> {
  for (const entry of entries) {
    await client.query(
      `
      INSERT INTO redis_keys (key, redis_type, ttl_ms, value, migrated_at, last_seen_run_id, last_seen_at)
      VALUES ($1, $2, $3, $4::jsonb, now(), $5::uuid, now())
      ON CONFLICT (key) DO UPDATE SET
        redis_type = EXCLUDED.redis_type,
        ttl_ms = EXCLUDED.ttl_ms,
        value = EXCLUDED.value,
        migrated_at = now(),
        last_seen_run_id = EXCLUDED.last_seen_run_id,
        last_seen_at = EXCLUDED.last_seen_at
      `,
      [entry.key, entry.type, entry.ttlMs, JSON.stringify(entry.value), runId],
    );
  }
}

async function upsertNormalizedRows(client: Client, entries: RedisSnapshotEntry[], runId: string): Promise<{
  activeGeneration: string | null;
  documentCount: number;
}> {
  const rows = buildFoodCatalogSnapshotRows(entries);

  for (const food of rows.foods) {
    await client.query(
      `
      INSERT INTO catalog_foods
        (id, carbohydrate, protein, fat, serving, region, source, raw_document, migrated_at, last_seen_run_id, last_seen_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, now(), $9::uuid, now())
      ON CONFLICT (id) DO UPDATE SET
        carbohydrate = EXCLUDED.carbohydrate,
        protein = EXCLUDED.protein,
        fat = EXCLUDED.fat,
        serving = EXCLUDED.serving,
        region = EXCLUDED.region,
        source = EXCLUDED.source,
        raw_document = EXCLUDED.raw_document,
        migrated_at = now(),
        last_seen_run_id = EXCLUDED.last_seen_run_id,
        last_seen_at = EXCLUDED.last_seen_at
      `,
      [
        food.id,
        food.carbohydrate,
        food.protein,
        food.fat,
        food.serving,
        food.region,
        food.source,
        JSON.stringify(food.rawDocument),
        runId,
      ],
    );
  }

  for (const localization of rows.localizations) {
    await client.query(
      `
      INSERT INTO catalog_food_localizations
        (food_id, lang, name, review_status, updated_at, raw_localization, migrated_at, last_seen_run_id, last_seen_at)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, now(), $7::uuid, now())
      ON CONFLICT (food_id, lang) DO UPDATE SET
        name = EXCLUDED.name,
        review_status = EXCLUDED.review_status,
        updated_at = EXCLUDED.updated_at,
        raw_localization = EXCLUDED.raw_localization,
        migrated_at = now(),
        last_seen_run_id = EXCLUDED.last_seen_run_id,
        last_seen_at = EXCLUDED.last_seen_at
      `,
      [
        localization.foodId,
        localization.lang,
        localization.name,
        localization.reviewStatus,
        localization.updatedAt,
        JSON.stringify(localization.rawLocalization),
        runId,
      ],
    );
  }

  for (const status of rows.localizationStatuses) {
    await client.query(
      `
      INSERT INTO catalog_food_localization_statuses
        (food_id, lang, status, reviewer_id, updated_at, raw_status, migrated_at, last_seen_run_id, last_seen_at)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, now(), $7::uuid, now())
      ON CONFLICT (food_id, lang) DO UPDATE SET
        status = EXCLUDED.status,
        reviewer_id = EXCLUDED.reviewer_id,
        updated_at = EXCLUDED.updated_at,
        raw_status = EXCLUDED.raw_status,
        migrated_at = now(),
        last_seen_run_id = EXCLUDED.last_seen_run_id,
        last_seen_at = EXCLUDED.last_seen_at
      `,
      [
        status.foodId,
        status.lang,
        status.status,
        status.reviewerId,
        status.updatedAt,
        JSON.stringify(status.rawStatus),
        runId,
      ],
    );
  }

  for (const popularity of rows.popularity) {
    await client.query(
      `
      INSERT INTO catalog_food_popularity
        (index_version, generation, lang, region, food_id, score, migrated_at, last_seen_run_id, last_seen_at)
      VALUES ($1, $2, $3, $4, $5, $6, now(), $7::uuid, now())
      ON CONFLICT (index_version, generation, lang, region, food_id) DO UPDATE SET
        score = EXCLUDED.score,
        migrated_at = now(),
        last_seen_run_id = EXCLUDED.last_seen_run_id,
        last_seen_at = EXCLUDED.last_seen_at
      `,
      [
        popularity.indexVersion,
        popularity.generation,
        popularity.lang,
        popularity.region,
        popularity.foodId,
        popularity.score,
        runId,
      ],
    );
  }

  for (const metadata of rows.metadata) {
    await client.query(
      `
      INSERT INTO catalog_metadata (key, value, migrated_at, last_seen_run_id, last_seen_at)
      VALUES ($1, $2::jsonb, now(), $3::uuid, now())
      ON CONFLICT (key) DO UPDATE SET
        value = EXCLUDED.value,
        migrated_at = now(),
        last_seen_run_id = EXCLUDED.last_seen_run_id,
        last_seen_at = EXCLUDED.last_seen_at
      `,
      [metadata.key, JSON.stringify(metadata.data), runId],
    );
  }

  return { activeGeneration: rows.activeGeneration, documentCount: rows.foods.length };
}

async function main(): Promise<void> {
  const redisUrl = requireEnv('REDIS_URL');
  const postgresUrl = requireEnv('POSTGRES_URL');
  const startedAt = new Date();
  const runId = randomUUID();
  const entries = await readRedisSnapshot(redisUrl);
  const client = new Client({ connectionString: postgresUrl });
  await client.connect();

  try {
    await client.query('BEGIN');
    await client.query(FOOD_CATALOG_SCHEMA_SQL);
    await upsertSnapshot(client, entries, runId);
    const normalized = await upsertNormalizedRows(client, entries, runId);
    assertCatalogSnapshotSafeForPrune({
      service: 'food',
      redisKeyCount: entries.length,
      normalizedDocumentCount: normalized.documentCount,
      activeCatalogMarker: normalized.activeGeneration,
      allowEmptyCatalogMigration: process.env.ALLOW_EMPTY_CATALOG_POSTGRES_MIGRATION === 'true',
    });
    for (const statement of FOOD_CATALOG_PRUNE_SQL) {
      await client.query(statement, [runId]);
    }
    await client.query(
      `
      INSERT INTO migration_runs
        (id, service, source_redis, started_at, finished_at, redis_key_count, normalized_document_count, active_generation, notes)
      VALUES ($1, $2, $3, $4, now(), $5, $6, $7, $8::jsonb)
      `,
      [
        runId,
        'food',
        redisUrl.replace(/\/\/.*@/, '//<redacted>@'),
        startedAt.toISOString(),
        entries.length,
        normalized.documentCount,
        normalized.activeGeneration,
        JSON.stringify({ pattern: REDIS_PATTERN }),
      ],
    );
    await client.query('COMMIT');
    console.log(JSON.stringify({
      service: 'food',
      runId,
      redisKeyCount: entries.length,
      documentCount: normalized.documentCount,
      activeGeneration: normalized.activeGeneration,
    }));
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
