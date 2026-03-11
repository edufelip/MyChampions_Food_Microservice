import request from 'supertest';

jest.mock('../../auth/firebase-auth', () => ({
  verifyIdToken: jest.fn().mockResolvedValue({ uid: 'test-user-123' }),
}));

describe('POST /catalog/admin/localization/review', () => {
  const VALID_AUTH = 'Bearer valid-firebase-token';

  afterEach(() => {
    jest.resetModules();
  });

  it('returns 401 without auth', async () => {
    const { createApp } = require('../../server') as typeof import('../../server');
    const app = createApp();
    const res = await request(app).post('/catalog/admin/localization/review').send({});
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid body', async () => {
    const { createApp } = require('../../server') as typeof import('../../server');
    const app = createApp();
    const res = await request(app)
      .post('/catalog/admin/localization/review')
      .set('Authorization', VALID_AUTH)
      .send({ foodId: '', lang: 'en', status: 'reviewed' });
    expect(res.status).toBe(400);
  });

  it('returns 403 when ingestion enabled but admin key missing', async () => {
    const originalEnabled = process.env.ENABLE_CATALOG_INGESTION;
    const originalKey = process.env.CATALOG_ADMIN_API_KEY;
    process.env.ENABLE_CATALOG_INGESTION = 'true';
    process.env.CATALOG_ADMIN_API_KEY = 'secret';

    const { createApp } = require('../../server') as typeof import('../../server');
    const app = createApp();
    const res = await request(app)
      .post('/catalog/admin/localization/review')
      .set('Authorization', VALID_AUTH)
      .send({ foodId: '1', lang: 'en', status: 'reviewed' });
    expect(res.status).toBe(403);

    process.env.ENABLE_CATALOG_INGESTION = originalEnabled;
    process.env.CATALOG_ADMIN_API_KEY = originalKey;
  });

  it('returns 200 when ingestion enabled and admin key valid', async () => {
    const originalEnabled = process.env.ENABLE_CATALOG_INGESTION;
    const originalKey = process.env.CATALOG_ADMIN_API_KEY;
    process.env.ENABLE_CATALOG_INGESTION = 'true';
    process.env.CATALOG_ADMIN_API_KEY = 'secret';

    jest.doMock('../../catalog/infrastructure/redis/redis-catalog-ingestion.repository', () => ({
      RedisCatalogIngestionRepository: jest.fn().mockImplementation(() => ({
        markLocalizedStatus: jest.fn().mockResolvedValue(undefined),
      })),
    }));

    const { createApp } = require('../../server') as typeof import('../../server');
    const app = createApp();
    const res = await request(app)
      .post('/catalog/admin/localization/review')
      .set('Authorization', VALID_AUTH)
      .set('x-catalog-admin-key', 'secret')
      .send({ foodId: '1', lang: 'en', status: 'reviewed', reviewerId: 'r1' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });

    process.env.ENABLE_CATALOG_INGESTION = originalEnabled;
    process.env.CATALOG_ADMIN_API_KEY = originalKey;
  });
});
