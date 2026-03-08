/**
 * Unit tests – FatSecret token provider (in-memory cache behaviour).
 */
import axios from 'axios';
import { getAccessToken, _resetTokenCache, _injectToken } from '../../fatsecret/token-provider';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Provide dummy env vars so config doesn't throw
process.env['FATSECRET_CLIENT_ID'] = 'test-client-id';
process.env['FATSECRET_CLIENT_SECRET'] = 'test-client-secret';
process.env['FATSECRET_TOKEN_URL'] = 'https://oauth.fatsecret.com/connect/token';

const MOCK_TOKEN_RESPONSE = {
  data: {
    access_token: 'test-access-token',
    expires_in: 86400,
    token_type: 'Bearer',
  },
  status: 200,
  statusText: 'OK',
  headers: {},
  config: {} as never,
};

describe('TokenProvider', () => {
  beforeEach(() => {
    _resetTokenCache();
    jest.clearAllMocks();
  });

  it('fetches a new token when no cached token exists', async () => {
    mockedAxios.post = jest.fn().mockResolvedValue(MOCK_TOKEN_RESPONSE);

    const token = await getAccessToken();

    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    expect(token).toBe('test-access-token');
  });

  it('returns cached token without re-fetching when still valid', async () => {
    mockedAxios.post = jest.fn().mockResolvedValue(MOCK_TOKEN_RESPONSE);

    // First call – fetches
    await getAccessToken();
    // Second call – uses cache
    const token = await getAccessToken();

    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    expect(token).toBe('test-access-token');
  });

  it('re-fetches when cached token is within expiry margin', async () => {
    mockedAxios.post = jest.fn().mockResolvedValue(MOCK_TOKEN_RESPONSE);

    // Inject an expired-soon token
    const expiryMarginSeconds = 60;
    _injectToken({
      accessToken: 'old-token',
      expiresAt: Date.now() + expiryMarginSeconds * 1000 - 1, // 1 ms before margin
    });

    const token = await getAccessToken();

    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    expect(token).toBe('test-access-token');
  });

  it('uses cached token when still outside expiry margin', async () => {
    mockedAxios.post = jest.fn().mockResolvedValue(MOCK_TOKEN_RESPONSE);

    _injectToken({
      accessToken: 'still-valid-token',
      expiresAt: Date.now() + 600_000, // 10 minutes from now
    });

    const token = await getAccessToken();

    expect(mockedAxios.post).not.toHaveBeenCalled();
    expect(token).toBe('still-valid-token');
  });

  it('propagates error when token fetch fails', async () => {
    mockedAxios.post = jest.fn().mockRejectedValue(new Error('Network error'));

    await expect(getAccessToken()).rejects.toThrow('Network error');
  });
});
