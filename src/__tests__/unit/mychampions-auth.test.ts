import {
  createMyChampionsAuthVerifier,
  MyChampionsAuthError,
} from '../../auth/mychampions-auth';

describe('MyChampions auth verifier', () => {
  it('forwards a bearer token to the root server profile boundary', async () => {
    const fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ profile: { authUid: 'user-123' } }), { status: 200 }),
    );
    const verify = createMyChampionsAuthVerifier({
      baseUrl: 'http://root-server.test/',
      fetch,
    });

    await expect(verify('access-token')).resolves.toEqual({ uid: 'user-123' });
    expect(fetch).toHaveBeenCalledWith('http://root-server.test/me', {
      method: 'GET',
      headers: { authorization: 'Bearer access-token' },
      redirect: 'error',
    });
  });

  it.each([401, 404])('maps root status %i to an unauthenticated error', async (status) => {
    const verify = createMyChampionsAuthVerifier({
      baseUrl: 'http://root-server.test',
      fetch: jest.fn().mockResolvedValue(new Response(null, { status })),
    });

    await expect(verify('access-token')).rejects.toMatchObject<Partial<MyChampionsAuthError>>({
      code: 'unauthenticated',
    });
  });

  it('maps root outages and malformed successful responses to unavailable', async () => {
    const unavailable = createMyChampionsAuthVerifier({
      baseUrl: 'http://root-server.test',
      fetch: jest.fn().mockRejectedValue(new Error('connection refused')),
    });
    const malformed = createMyChampionsAuthVerifier({
      baseUrl: 'http://root-server.test',
      fetch: jest.fn().mockResolvedValue(new Response(JSON.stringify({ profile: {} }), { status: 200 })),
    });

    await expect(unavailable('access-token')).rejects.toMatchObject<Partial<MyChampionsAuthError>>({
      code: 'unavailable',
    });
    await expect(malformed('access-token')).rejects.toMatchObject<Partial<MyChampionsAuthError>>({
      code: 'unavailable',
    });
  });
});
