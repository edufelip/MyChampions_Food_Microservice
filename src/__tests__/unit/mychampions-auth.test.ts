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
    expect(fetch).toHaveBeenCalledWith(
      'http://root-server.test/me',
      expect.objectContaining({
        method: 'GET',
        headers: { authorization: 'Bearer access-token' },
        redirect: 'error',
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('maps root 401 to an unauthenticated error', async () => {
    const verify = createMyChampionsAuthVerifier({
      baseUrl: 'http://root-server.test',
      fetch: jest.fn().mockResolvedValue(new Response(null, { status: 401 })),
    });

    await expect(verify('access-token')).rejects.toMatchObject<Partial<MyChampionsAuthError>>({
      code: 'unauthenticated',
    });
  });

  it('maps root 404 to an unavailable error', async () => {
    const verify = createMyChampionsAuthVerifier({
      baseUrl: 'http://root-server.test',
      fetch: jest.fn().mockResolvedValue(new Response(null, { status: 404 })),
    });

    await expect(verify('access-token')).rejects.toMatchObject<Partial<MyChampionsAuthError>>({
      code: 'unavailable',
    });
  });

  it('aborts a stalled root auth request after the configured timeout', async () => {
    const fetch = jest.fn().mockImplementation((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
    }));
    const verifierOptions = {
      baseUrl: 'http://root-server.test',
      fetch,
      timeoutMs: 10,
    } as unknown as Parameters<typeof createMyChampionsAuthVerifier>[0];
    const verify = createMyChampionsAuthVerifier(verifierOptions);

    await expect(verify('access-token')).rejects.toMatchObject<Partial<MyChampionsAuthError>>({
      code: 'unavailable',
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
