import { Request, Response } from 'express';

function createMockRes() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  return { res: { status } as unknown as Response, status, json };
}

describe('catalog-health.controller', () => {
  const originalMaxAge = process.env.CATALOG_MAX_AGE_DAYS;

  beforeEach(() => {
    jest.resetModules();
    process.env.CATALOG_MAX_AGE_DAYS = '180';
  });

  afterAll(() => {
    process.env.CATALOG_MAX_AGE_DAYS = originalMaxAge;
  });

  it('returns freshness metadata for valid timestamp', async () => {
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-03-12T00:00:00.000Z'));
    const snapshot = {
      enabled: true,
      ready: true,
      indexVersion: 'v1',
      documentCount: 120,
      lastFreshnessAt: '2026-03-10T00:00:00.000Z',
    };

    jest.doMock('../../catalog/application/get-catalog-health.service', () => ({
      createCatalogHealthService: jest.fn(() => jest.fn().mockResolvedValue(snapshot)),
    }));
    jest.doMock('../../catalog/infrastructure/redis/redis-catalog-provider.repository', () => ({
      RedisCatalogProviderRepository: jest.fn(() => ({})),
    }));

    const { catalogHealthController } =
      require('../../controllers/catalog-health.controller') as typeof import('../../controllers/catalog-health.controller');

    const { res, status, json } = createMockRes();
    await catalogHealthController({} as Request, res);

    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({
      ...snapshot,
      stale: false,
      maxAgeDays: 180,
      freshnessAgeDays: 2,
    });

    nowSpy.mockRestore();
  });

  it('marks response as stale when freshness timestamp is invalid', async () => {
    const snapshot = {
      enabled: true,
      ready: true,
      indexVersion: 'v1',
      documentCount: 120,
      lastFreshnessAt: 'not-a-date',
    };

    jest.doMock('../../catalog/application/get-catalog-health.service', () => ({
      createCatalogHealthService: jest.fn(() => jest.fn().mockResolvedValue(snapshot)),
    }));
    jest.doMock('../../catalog/infrastructure/redis/redis-catalog-provider.repository', () => ({
      RedisCatalogProviderRepository: jest.fn(() => ({})),
    }));

    const { catalogHealthController } =
      require('../../controllers/catalog-health.controller') as typeof import('../../controllers/catalog-health.controller');

    const { res, status, json } = createMockRes();
    await catalogHealthController({} as Request, res);

    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({
      ...snapshot,
      stale: true,
      maxAgeDays: 180,
      freshnessAgeDays: null,
    });
  });
});
