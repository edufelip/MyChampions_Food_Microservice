import axios from 'axios';

jest.mock('axios');
jest.mock('../../fatsecret/token-provider', () => ({
  getAccessToken: jest.fn().mockResolvedValue('mock-token'),
}));

import { searchFoods, FatSecretError } from '../../fatsecret/search-client';

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('searchFoods', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('throws upstream_ip_not_allowlisted on FatSecret body error code 21', async () => {
    mockedAxios.get = jest.fn().mockResolvedValue({
      data: { error: { code: 21, message: 'Invalid IP address' } },
    } as never);

    await expect(searchFoods('Rice', 10, 'US', 'en')).rejects.toMatchObject<Partial<FatSecretError>>({
      name: 'FatSecretError',
      fatSecretCode: 'upstream_ip_not_allowlisted',
      statusCode: 502,
    });
  });

  it('throws quota_exceeded on FatSecret body error code 22', async () => {
    mockedAxios.get = jest.fn().mockResolvedValue({
      data: { error: { code: 22, message: 'Quota exceeded' } },
    } as never);

    await expect(searchFoods('Rice', 10, 'US', 'en')).rejects.toMatchObject<Partial<FatSecretError>>({
      name: 'FatSecretError',
      fatSecretCode: 'quota_exceeded',
    });
  });

  it('calls v5 foods.search with generic food_type, region, and language', async () => {
    mockedAxios.get = jest.fn().mockResolvedValue({
      data: {
        foods: {
          food: [],
        },
      },
    } as never);

    await searchFoods('Rice', 10, 'US', 'en');

    expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    const [url] = mockedAxios.get.mock.calls[0] as [string];
    expect(url).toContain('method=foods.search');
    expect(url).toContain('search_expression=Rice');
    expect(url).toContain('max_results=10');
    expect(url).toContain('food_type=generic');
    expect(url).toContain('region=US');
    expect(url).toContain('language=en');
  });
});
