import request from 'supertest';

const ORIGINAL_ENV = process.env;

describe('Translation path selection', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
    process.env['ENABLE_TRANSLATION_PIPELINE'] = 'true';
    process.env['GOOGLE_TRANSLATE_API_KEY'] = 'test-key';
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('uses localized search service when translation pipeline is enabled and key exists', async () => {
    const searchFoodsLocalized = jest.fn().mockResolvedValue([
      { id: '1', name: 'Frango', carbohydrate: 0, protein: 31, fat: 3.6, serving: 100 },
    ]);
    const searchFoods = jest.fn().mockResolvedValue([
      { id: '1', name: 'Chicken', carbohydrate: 0, protein: 31, fat: 3.6, serving: 100 },
    ]);

    jest.doMock('../../auth/firebase-auth', () => ({
      verifyIdToken: jest.fn().mockResolvedValue({ uid: 'test-user-translate-path' }),
    }));

    jest.doMock('../../services/search-foods-localized.service', () => ({
      searchFoodsLocalized,
    }));

    jest.doMock('../../fatsecret/search-client', () => ({
      searchFoods,
      FatSecretError: class FatSecretError extends Error {
        statusCode?: number;
        fatSecretCode?: string;
        constructor(message: string, statusCode?: number, fatSecretCode?: string) {
          super(message);
          this.name = 'FatSecretError';
          this.statusCode = statusCode;
          this.fatSecretCode = fatSecretCode;
        }
      },
    }));

    const { createApp } = await import('../../server');
    const app = createApp();

    const res = await request(app)
      .post('/searchFoods')
      .set('Authorization', 'Bearer valid-firebase-token')
      .send({ query: 'pollo', maxResults: 5, region: 'US', language: 'es' });

    expect(res.status).toBe(200);
    expect(searchFoodsLocalized).toHaveBeenCalledTimes(1);
    expect(searchFoods).not.toHaveBeenCalled();
    expect(res.body.results[0].name).toBe('Frango');
  });
});
