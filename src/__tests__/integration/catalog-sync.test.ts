import request from 'supertest';
import { createApp } from '../../server';

jest.mock('../../auth/firebase-auth', () => ({
  verifyIdToken: jest.fn().mockResolvedValue({ uid: 'test-user-123' }),
}));

jest.mock('../../catalog/application/sync-food-catalog.service', () => ({
  syncFoodCatalog: jest.fn(),
}));
import { syncFoodCatalog } from '../../catalog/application/sync-food-catalog.service';

const mockedSyncFoodCatalog = syncFoodCatalog as jest.MockedFunction<typeof syncFoodCatalog>;

describe('POST /catalog/admin/sync', () => {
  const app = createApp();
  const VALID_AUTH = 'Bearer valid-firebase-token';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 401 without auth', async () => {
    const res = await request(app).post('/catalog/admin/sync').send({});
    expect(res.status).toBe(401);
  });

  it('returns 503 when ingestion is disabled', async () => {
    const res = await request(app)
      .post('/catalog/admin/sync')
      .set('Authorization', VALID_AUTH)
      .send({});

    expect(res.status).toBe(503);
    expect(res.body).toEqual({
      error: 'catalog_ingestion_disabled',
      message: 'Catalog ingestion is disabled',
    });
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

    const { createApp: createEnabledApp } = require('../../server') as typeof import('../../server');
    const enabledApp = createEnabledApp();
    const { syncFoodCatalog: syncMockRef } = require('../../catalog/application/sync-food-catalog.service') as typeof import('../../catalog/application/sync-food-catalog.service');
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
