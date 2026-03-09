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

    await expect(searchFoods('Rice', 10)).rejects.toMatchObject<Partial<FatSecretError>>({
      name: 'FatSecretError',
      fatSecretCode: 'upstream_ip_not_allowlisted',
      statusCode: 502,
    });
  });

  it('throws quota_exceeded on FatSecret body error code 22', async () => {
    mockedAxios.get = jest.fn().mockResolvedValue({
      data: { error: { code: 22, message: 'Quota exceeded' } },
    } as never);

    await expect(searchFoods('Rice', 10)).rejects.toMatchObject<Partial<FatSecretError>>({
      name: 'FatSecretError',
      fatSecretCode: 'quota_exceeded',
    });
  });

  it('returns mapped results when FatSecret payload has foods', async () => {
    mockedAxios.get = jest.fn().mockResolvedValue({
      data: {
        foods: {
          food: [
            { food_id: '1', food_name: 'Rice' },
          ],
        },
      },
    } as never);

    const results = await searchFoods('Rice', 10);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ food_id: '1', food_name: 'Rice' });
  });
});
