import { config } from '../config';

export type AuthenticatedMyChampionsUser = {
  uid: string;
};

export class MyChampionsAuthError extends Error {
  constructor(
    public readonly code: 'unauthenticated' | 'unavailable',
    message: string,
  ) {
    super(message);
    this.name = 'MyChampionsAuthError';
  }
}

type RootAuthPayload = {
  profile?: {
    authUid?: unknown;
  };
};

export function createMyChampionsAuthVerifier(options: {
  baseUrl: string | null;
  fetch: typeof globalThis.fetch;
}): (accessToken: string) => Promise<AuthenticatedMyChampionsUser> {
  const baseUrl = options.baseUrl?.replace(/\/+$/, '') || null;

  return async (accessToken: string): Promise<AuthenticatedMyChampionsUser> => {
    if (!baseUrl) {
      throw new MyChampionsAuthError('unavailable', 'MyChampions auth server is not configured.');
    }

    let response: Response;
    try {
      response = await options.fetch(`${baseUrl}/me`, {
        method: 'GET',
        headers: { authorization: `Bearer ${accessToken}` },
        redirect: 'error',
      });
    } catch {
      throw new MyChampionsAuthError('unavailable', 'MyChampions auth server is unavailable.');
    }

    if (response.status === 401 || response.status === 404) {
      throw new MyChampionsAuthError('unauthenticated', 'MyChampions session is invalid.');
    }
    if (!response.ok) {
      throw new MyChampionsAuthError('unavailable', 'MyChampions auth server is unavailable.');
    }

    let payload: RootAuthPayload;
    try {
      payload = await response.json() as RootAuthPayload;
    } catch {
      throw new MyChampionsAuthError('unavailable', 'MyChampions auth response is invalid.');
    }

    const authUid = payload.profile?.authUid;
    if (typeof authUid !== 'string' || authUid.trim().length === 0) {
      throw new MyChampionsAuthError('unavailable', 'MyChampions auth response is invalid.');
    }
    return { uid: authUid };
  };
}

export const verifyMyChampionsAccessToken = createMyChampionsAuthVerifier({
  baseUrl: config.mychampionsAuthServerUrl,
  fetch: globalThis.fetch,
});
