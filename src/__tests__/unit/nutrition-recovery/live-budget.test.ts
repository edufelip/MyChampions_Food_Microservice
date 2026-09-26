import { createBudgetedRequest } from '../../../catalog/recovery/live-budget';
import { createTypesafeClient, TypesafeHttpResponse, TypesafeRequest } from '../../../catalog/recovery/typesafe-client';

function response(status: number, body: unknown): TypesafeHttpResponse {
  return {
    status,
    headers: { get: () => null },
    json: async () => body,
  };
}

const payload = {
  model: 'jev-1.13.0' as const,
  state: { description: 'Per 100g', locale: 'en-US' as const, panel: { start: 0, end: 8 }, candidates: [] },
  questions: {} as never,
};

const validProviderBody = {
  model: 'jev-1.13.0',
  answers: {
    grams: { type: 'choice', choice: 'v0', confidence: 0.99, probabilities: { v0: 0.99, none: 0.01 } },
    carbohydrate: { type: 'choice', choice: 'v1', confidence: 0.99, probabilities: { v1: 0.99, none: 0.01 } },
    protein: { type: 'choice', choice: 'v2', confidence: 0.99, probabilities: { v2: 0.99, none: 0.01 } },
    fat: { type: 'choice', choice: 'v3', confidence: 0.99, probabilities: { v3: 0.99, none: 0.01 } },
  },
};

describe('live TypeSafe budget guard', () => {
  it('uses a conservative reservation and reconciles reported input usage', async () => {
    const body = { usage: { input_tokens: 3, output_tokens: 1 } };
    const guard = createBudgetedRequest({
      maxRequests: 2,
      maxInputTokens: 100,
      request: async () => response(200, body),
    });
    const wrapped = await guard.request('https://example.test', {
      method: 'POST',
      headers: {},
      body: '{"description":"a long enough payload"}',
      signal: new AbortController().signal,
    });
    await wrapped.json();
    expect(guard.state()).toMatchObject({ remainingRequests: 1, remainingInputTokens: 97, providerCalls: 1, authFailed: false });
  });

  it('returns a typed budget error before transport when the cap is exhausted', async () => {
    let calls = 0;
    const guard = createBudgetedRequest({ maxRequests: 0, maxInputTokens: 100, request: async () => { calls += 1; return response(200, {}); } });
    await expect(guard.request('https://example.test', { method: 'POST', headers: {}, body: '{}', signal: new AbortController().signal })).rejects.toHaveProperty('code', 'budget_exhausted');
    expect(calls).toBe(0);
  });

  it('marks auth failure for the run and prevents subsequent transport calls', async () => {
    let calls = 0;
    const guard = createBudgetedRequest({ maxRequests: 3, maxInputTokens: 1000, request: async () => { calls += 1; return response(401, {}); } });
    await guard.request('https://example.test', { method: 'POST', headers: {}, body: '{}', signal: new AbortController().signal });
    expect(guard.state().authFailed).toBe(true);
    await expect(guard.request('https://example.test', { method: 'POST', headers: {}, body: '{}', signal: new AbortController().signal })).rejects.toHaveProperty('code', 'unauthorized');
    expect(calls).toBe(1);
  });

  it('preserves native Response status and headers for successful transport', async () => {
    const guard = createBudgetedRequest({
      maxRequests: 1,
      maxInputTokens: 10_000,
      request: (async () => new Response(JSON.stringify(validProviderBody), { status: 200 })) as TypesafeRequest,
    });
    const client = createTypesafeClient({ apiKey: 'test-key', request: guard.request });
    await expect(client.choose(payload)).resolves.toMatchObject({ response: { model: 'jev-1.13.0' } });
  });

  it('preserves native 401 status and stops the second request', async () => {
    let calls = 0;
    const guard = createBudgetedRequest({
      maxRequests: 3,
      maxInputTokens: 10_000,
      request: (async () => { calls += 1; return new Response('', { status: 401 }); }) as TypesafeRequest,
    });
    const client = createTypesafeClient({ apiKey: 'test-key', request: guard.request });
    await expect(client.choose(payload)).rejects.toHaveProperty('code', 'unauthorized');
    await expect(client.choose(payload)).rejects.toHaveProperty('code', 'unauthorized');
    expect(calls).toBe(1);
  });

  it('preserves native retry-after headers on 429 responses', async () => {
    let calls = 0;
    const guard = createBudgetedRequest({
      maxRequests: 2,
      maxInputTokens: 10_000,
      request: (async () => {
        calls += 1;
        return calls === 1
          ? new Response('', { status: 429, headers: { 'retry-after': '0' } })
          : new Response(JSON.stringify(validProviderBody), { status: 200 });
      }) as TypesafeRequest,
    });
    const client = createTypesafeClient({ apiKey: 'test-key', request: guard.request, sleep: async () => undefined });
    await expect(client.choose(payload)).resolves.toMatchObject({ response: { model: 'jev-1.13.0' } });
    expect(calls).toBe(2);
  });
});
