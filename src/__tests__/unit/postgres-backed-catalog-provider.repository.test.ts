import { config } from '../../config';
import { CatalogProviderPort } from '../../catalog/domain/catalog-ports';
import { PostgresBackedCatalogProviderRepository } from '../../catalog/infrastructure/postgres/postgres-backed-catalog-provider.repository';
import { rebuildRedisCatalogFromPostgres } from '../../catalog/infrastructure/postgres/rebuild-redis-catalog-from-postgres';

jest.mock('../../catalog/infrastructure/postgres/rebuild-redis-catalog-from-postgres', () => ({
  rebuildRedisCatalogFromPostgres: jest.fn(),
}));

function makeProvider(readyStates: boolean[]): CatalogProviderPort {
  return {
    searchByPrefix: jest.fn().mockResolvedValue({ total: 0, items: [] }),
    getPopular: jest.fn().mockResolvedValue({ total: 0, items: [] }),
    getHealth: jest.fn().mockImplementation(async () => ({
      enabled: true,
      ready: readyStates.shift() ?? true,
      indexVersion: 'v1',
      activeGeneration: 'a',
      documentCount: 10,
      lastFreshnessAt: new Date().toISOString(),
      stale: false,
    })),
    recordServed: jest.fn().mockResolvedValue(undefined),
    recordClicked: jest.fn().mockResolvedValue(undefined),
  };
}

describe('PostgresBackedCatalogProviderRepository', () => {
  const original = {
    postgresUrl: config.postgresUrl,
    redisUrl: config.redisUrl,
    catalogPostgresRestoreOnMiss: config.catalogPostgresRestoreOnMiss,
  };

  beforeEach(() => {
    Object.assign(config, {
      postgresUrl: 'postgresql://food-catalog',
      redisUrl: 'redis://food-redis',
      catalogPostgresRestoreOnMiss: true,
    });
    jest.mocked(rebuildRedisCatalogFromPostgres).mockResolvedValue({
      deletedRedisKeyCount: 0,
      restoredRedisKeyCount: 4,
    });
  });

  afterEach(() => {
    Object.assign(config, original);
    jest.clearAllMocks();
  });

  it('restores Redis from Postgres before searching when catalog health is not ready', async () => {
    const delegate = makeProvider([false, true]);
    const provider = new PostgresBackedCatalogProviderRepository(delegate);

    await provider.searchByPrefix({
      lang: 'en',
      normalizedQuery: 'chicken',
      page: 1,
      pageSize: 10,
      region: 'US',
    });

    expect(rebuildRedisCatalogFromPostgres).toHaveBeenCalledWith({
      redisUrl: 'redis://food-redis',
      postgresUrl: 'postgresql://food-catalog',
      replaceExisting: true,
    });
    expect(delegate.searchByPrefix).toHaveBeenCalledTimes(1);
  });

  it('leaves Redis untouched when health is ready', async () => {
    const delegate = makeProvider([true]);
    const provider = new PostgresBackedCatalogProviderRepository(delegate);

    await provider.getPopular({
      lang: 'en',
      page: 1,
      pageSize: 10,
      region: 'US',
    });

    expect(rebuildRedisCatalogFromPostgres).not.toHaveBeenCalled();
    expect(delegate.getPopular).toHaveBeenCalledTimes(1);
  });
});
