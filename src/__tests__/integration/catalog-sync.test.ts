import request from 'supertest';
import { createApp } from '../../server';

jest.mock('../../auth/mychampions-auth', () => ({
  MyChampionsAuthError: class MyChampionsAuthError extends Error {},
  verifyMyChampionsAccessToken: jest.fn().mockResolvedValue({ uid: 'test-user-123' }),
}));

jest.mock('../../catalog/application/sync-food-catalog.service', () => ({
  syncFoodCatalog: jest.fn(),
}));
import { syncFoodCatalog } from '../../catalog/application/sync-food-catalog.service';

const mockedSyncFoodCatalog = syncFoodCatalog as jest.MockedFunction<typeof syncFoodCatalog>;

describe('POST /catalog/admin/sync', () => {
  const app = createApp();
  const VALID_AUTH = 'Bearer valid-mychampions-token';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 401 without auth', async () => {
    const res = await request(app).post('/catalog/admin/sync').send({});
    expect(res.status).toBe(401);
  });

  it('returns 503 catalog_admin_misconfigured without an admin key header when no key is configured', async () => {
    const res = await request(app)
      .post('/catalog/admin/sync')
      .set('Authorization', VALID_AUTH)
      .send({});

    expect(res.status).toBe(503);
    expect(res.body).toEqual({
      error: 'catalog_admin_misconfigured',
      message: 'Catalog admin key is not configured',
    });
  });

  // Regression for ET-59: requireCatalogAdmin must reject a missing admin key
  // with 403 even when ENABLE_CATALOG_INGESTION is false (the documented
  // default) — it must never silently call next() because of that flag.
  it('returns 403 forbidden without an admin key header, even when ingestion is disabled', async () => {
    const originalEnabled = process.env.ENABLE_CATALOG_INGESTION;
    const originalAdminKey = process.env.CATALOG_ADMIN_API_KEY;
    process.env.ENABLE_CATALOG_INGESTION = 'false';
    process.env.CATALOG_ADMIN_API_KEY = 'secret';
    jest.resetModules();

    const { createApp: createDisabledApp } = await import('../../server');
    const disabledApp = createDisabledApp();

    const res = await request(disabledApp)
      .post('/catalog/admin/sync')
      .set('Authorization', VALID_AUTH)
      .send({});

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'forbidden', message: 'Missing catalog admin key' });

    process.env.ENABLE_CATALOG_INGESTION = originalEnabled;
    process.env.CATALOG_ADMIN_API_KEY = originalAdminKey;
    jest.resetModules();
  });

  it('returns 503 catalog_ingestion_disabled from the controller when a valid admin key is presented but ingestion is disabled', async () => {
    const originalEnabled = process.env.ENABLE_CATALOG_INGESTION;
    const originalAdminKey = process.env.CATALOG_ADMIN_API_KEY;
    process.env.ENABLE_CATALOG_INGESTION = 'false';
    process.env.CATALOG_ADMIN_API_KEY = 'secret';
    jest.resetModules();

    const { createApp: createDisabledApp } = await import('../../server');
    const disabledApp = createDisabledApp();

    const res = await request(disabledApp)
      .post('/catalog/admin/sync')
      .set('Authorization', VALID_AUTH)
      .set('x-catalog-admin-key', 'secret')
      .send({});

    expect(res.status).toBe(503);
    expect(res.body).toEqual({
      error: 'catalog_ingestion_disabled',
      message: 'Catalog ingestion is disabled',
    });

    process.env.ENABLE_CATALOG_INGESTION = originalEnabled;
    process.env.CATALOG_ADMIN_API_KEY = originalAdminKey;
    jest.resetModules();
  });

  it('returns 200 when ingestion is enabled and admin key is valid', async () => {
    const originalEnabled = process.env.ENABLE_CATALOG_INGESTION;
    const originalAdminKey = process.env.CATALOG_ADMIN_API_KEY;
    process.env.ENABLE_CATALOG_INGESTION = 'true';
    process.env.CATALOG_ADMIN_API_KEY = 'secret';
    mockedSyncFoodCatalog.mockResolvedValue({
      seedQueries: ['rice'],
      region: 'US',
      maxResultsPerQuery: 10,
      fetchedItems: 1,
      upsertedDocuments: 1,
    });
    jest.resetModules();

    const { createApp: createEnabledApp } = await import('../../server');
    const enabledApp = createEnabledApp();
    const { syncFoodCatalog: syncMockRef } = await import('../../catalog/application/sync-food-catalog.service');
    (syncMockRef as jest.MockedFunction<typeof syncFoodCatalog>).mockResolvedValue({
      seedQueries: ['rice'],
      region: 'US',
      maxResultsPerQuery: 10,
      fetchedItems: 1,
      upsertedDocuments: 1,
    });

    const res = await request(enabledApp)
      .post('/catalog/admin/sync')
      .set('Authorization', VALID_AUTH)
      .set('x-catalog-admin-key', 'secret')
      .send({ seedQueries: ['rice'], maxResultsPerQuery: 10 });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ upsertedDocuments: 1 });

    process.env.ENABLE_CATALOG_INGESTION = originalEnabled;
    process.env.CATALOG_ADMIN_API_KEY = originalAdminKey;
    jest.resetModules();
  });
});
