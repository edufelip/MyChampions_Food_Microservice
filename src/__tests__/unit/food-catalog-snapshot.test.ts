import { FOOD_CATALOG_PRUNE_SQL, FOOD_CATALOG_SCHEMA_SQL } from '../../catalog/infrastructure/postgres/catalog-persistence-schema';
import {
  assertRedisRebuildAllowed,
  asStringRecord,
  asZSetArgs,
  resolveRedisRebuildMode,
  validateRedisSnapshotEntries,
} from '../../catalog/infrastructure/postgres/catalog-redis-rebuild';
import { assertCatalogSnapshotSafeForPrune } from '../../catalog/infrastructure/postgres/catalog-snapshot-prune-guard';
import { buildFoodCatalogSnapshotRows } from '../../catalog/infrastructure/postgres/food-catalog-snapshot';

describe('buildFoodCatalogSnapshotRows', () => {
  it('builds normalized rows from Redis food catalog keys', () => {
    const rows = buildFoodCatalogSnapshotRows([
      {
        key: 'catalog:active-gen:v1',
        type: 'string',
        ttlMs: -1,
        value: 'a',
      },
      {
        key: 'catalog:stats:v1',
        type: 'hash',
        ttlMs: -1,
        value: {
          documentCount: '1',
          lastFreshnessAt: '2026-06-19T00:00:00.000Z',
        },
      },
      {
        key: 'catalog:food:4820:v1',
        type: 'string',
        ttlMs: -1,
        value: JSON.stringify({
          id: '4820',
          nutrition: {
            carbohydrate: 0,
            protein: 31,
            fat: 3.6,
            serving: 100,
          },
          localized: {
            en: {
              name: 'Chicken Breast',
              reviewStatus: 'machine',
              updatedAt: '2026-06-19T00:00:00.000Z',
            },
            pt: {
              name: 'Peito de Frango',
              reviewStatus: 'reviewed',
              updatedAt: '2026-06-19T00:00:00.000Z',
            },
          },
          region: 'US',
          source: 'fatsecret',
        }),
      },
      {
        key: 'catalog:l10n:status:4820:pt',
        type: 'hash',
        ttlMs: -1,
        value: {
          status: 'reviewed',
          reviewerId: 'admin',
          updatedAt: '2026-06-19T00:00:00.000Z',
        },
      },
      {
        key: 'catalog:popularity:v1:a:pt:GLOBAL',
        type: 'zset',
        ttlMs: -1,
        value: [{ member: '4820', score: 2.5 }],
      },
    ]);

    expect(rows.activeGeneration).toBe('a');
    expect(rows.foods).toEqual([
      expect.objectContaining({
        id: '4820',
        carbohydrate: 0,
        protein: 31,
        fat: 3.6,
        serving: 100,
        region: 'US',
        source: 'fatsecret',
      }),
    ]);
    expect(rows.localizations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          foodId: '4820',
          lang: 'pt',
          name: 'Peito de Frango',
          reviewStatus: 'reviewed',
        }),
      ]),
    );
    expect(rows.localizationStatuses).toEqual([
      expect.objectContaining({
        foodId: '4820',
        lang: 'pt',
        status: 'reviewed',
        reviewerId: 'admin',
      }),
    ]);
    expect(rows.popularity).toEqual([
      expect.objectContaining({
        lang: 'pt',
        region: 'GLOBAL',
        generation: 'a',
        foodId: '4820',
        score: 2.5,
      }),
    ]);
    expect(rows.metadata).toEqual([
      expect.objectContaining({
        key: 'stats',
        data: {
          documentCount: '1',
          lastFreshnessAt: '2026-06-19T00:00:00.000Z',
        },
      }),
    ]);
  });

  it('tracks last-seen migration runs and prunes stale snapshot rows', () => {
    expect(FOOD_CATALOG_SCHEMA_SQL).toContain('last_seen_run_id uuid');
    expect(FOOD_CATALOG_SCHEMA_SQL).toContain('ALTER TABLE redis_keys ADD COLUMN IF NOT EXISTS last_seen_run_id uuid');
    expect(FOOD_CATALOG_PRUNE_SQL).toContain('DELETE FROM redis_keys WHERE last_seen_run_id IS DISTINCT FROM $1::uuid');
    expect(FOOD_CATALOG_PRUNE_SQL[0]).toContain('catalog_food_popularity');
  });

  it('refuses to prune Postgres from an empty or unready Redis snapshot', () => {
    expect(() => assertCatalogSnapshotSafeForPrune({
      service: 'food',
      redisKeyCount: 0,
      normalizedDocumentCount: 0,
      activeCatalogMarker: null,
      allowEmptyCatalogMigration: false,
    })).toThrow(/refused to prune stale rows/);

    expect(() => assertCatalogSnapshotSafeForPrune({
      service: 'food',
      redisKeyCount: 0,
      normalizedDocumentCount: 0,
      activeCatalogMarker: null,
      allowEmptyCatalogMigration: true,
    })).not.toThrow();
  });

  it('defaults Redis rebuilds to dry-run and requires explicit write confirmation', () => {
    expect(resolveRedisRebuildMode({})).toBe('dry-run');
    expect(resolveRedisRebuildMode({ DRY_RUN: 'false' })).toBe('write');
    expect(() => assertRedisRebuildAllowed({
      rowCount: 10,
      mode: 'write',
      confirmed: false,
    })).toThrow(/CONFIRM_REDIS_REBUILD=true/);
    expect(() => assertRedisRebuildAllowed({
      rowCount: 10,
      mode: 'write',
      confirmed: true,
    })).not.toThrow();
  });

  it('normalizes Postgres JSON values for Redis restore commands', () => {
    expect(asStringRecord({ status: 'reviewed', count: 2 })).toEqual({
      status: 'reviewed',
      count: '2',
    });
    expect(asZSetArgs([{ member: '4820', score: 2.5 }])).toEqual(['2.5', '4820']);
  });

  it('validates all Redis rebuild rows before write mode can delete live keys', () => {
    expect(() => validateRedisSnapshotEntries([
      { key: 'catalog:food:4820:v1', type: 'string', value: '{}' },
      { key: 'catalog:status:4820', type: 'hash', value: { status: 'reviewed' } },
      { key: 'catalog:popularity:v1:a:pt:GLOBAL', type: 'zset', value: [{ member: '4820', score: 1 }] },
    ])).not.toThrow();

    expect(() => validateRedisSnapshotEntries([
      { key: 'catalog:stream', type: 'stream', value: [] },
    ])).toThrow(/unsupported Redis type/);

    expect(() => validateRedisSnapshotEntries([
      { key: 'catalog:food:4820:v1', type: 'string', value: null },
    ])).toThrow(/invalid string value/);
  });
});
