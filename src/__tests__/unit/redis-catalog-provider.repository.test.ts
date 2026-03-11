import { RedisCatalogProviderRepository } from '../../catalog/infrastructure/redis/redis-catalog-provider.repository';

jest.mock('../../cache/redis-client', () => ({
  getRedisClient: jest.fn(),
}));

import { getRedisClient } from '../../cache/redis-client';

type PipelineResultTuple = [Error | null, string | null];

function createMockRedis() {
  const docs = new Map<string, string>([
    [
      'catalog:food:1:v1',
      JSON.stringify({
        id: '1',
        nutrition: { carbohydrate: 0, protein: 31, fat: 3.6, serving: 100 },
        localized: { en: { name: 'Chicken Breast', reviewStatus: 'reviewed' } },
      }),
    ],
  ]);

  const zsetMap = new Map<string, string[]>([
    ['catalog:index:v1:a:en:chicken', ['1']],
    ['catalog:index:v1:a:en:breast', ['1']],
  ]);

  const smembersMap = new Map<string, string[]>([
    ['catalog:syn:v1:a:en:chicken', ['chicken']],
    ['catalog:syn:v1:a:en:breast', ['breast']],
    ['catalog:syn:v1:a:en:chiken', []],
    ['catalog:tokens:v1:a:en', ['chicken', 'breast']],
  ]);

  return {
    get: jest.fn(async (key: string) => (key === 'catalog:active-gen:v1' ? 'a' : null)),
    zrevrange: jest.fn(async (key: string) => zsetMap.get(key) ?? []),
    smembers: jest.fn(async (key: string) => smembersMap.get(key) ?? []),
    mget: jest.fn(async (keys: string[]) => keys.map((key) => docs.get(key) ?? null)),
    zcard: jest.fn(async () => 0),
    hget: jest.fn(async () => null),
    pipeline: jest.fn(() => {
      const results: PipelineResultTuple[] = [];
      return {
        zscore: jest.fn(() => {
          results.push([null, '0']);
        }),
        zincrby: jest.fn(() => {
          results.push([null, 'OK']);
        }),
        exec: jest.fn(async () => results),
      };
    }),
  };
}

describe('RedisCatalogProviderRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('matches multi-token query as exact tier', async () => {
    const mockRedis = createMockRedis();
    (getRedisClient as jest.Mock).mockReturnValue(mockRedis);

    const repository = new RedisCatalogProviderRepository();
    const result = await repository.searchByPrefix({
      lang: 'en',
      normalizedQuery: 'chicken breast',
      page: 1,
      pageSize: 10,
      region: 'US',
    });

    expect(result.total).toBe(1);
    expect(result.items[0]?.id).toBe('1');
  });

  it('returns typo match using language token dictionary', async () => {
    const mockRedis = createMockRedis();
    (getRedisClient as jest.Mock).mockReturnValue(mockRedis);

    const repository = new RedisCatalogProviderRepository();
    const result = await repository.searchByPrefix({
      lang: 'en',
      normalizedQuery: 'chiken',
      page: 1,
      pageSize: 10,
      region: 'US',
    });

    expect(result.total).toBe(1);
    expect(result.items[0]?.name).toBe('Chicken Breast');
    expect(mockRedis.smembers).toHaveBeenCalledWith('catalog:tokens:v1:a:en');
  });
});
