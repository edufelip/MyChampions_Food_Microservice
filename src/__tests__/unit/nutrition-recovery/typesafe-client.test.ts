import { createTypesafeClient, TypesafeHttpResponse } from '../../../catalog/recovery/typesafe-client';

function response(status: number, body: unknown, retryAfter?: string): TypesafeHttpResponse {
  return {
    status,
    headers: { get: (name: string) => name === 'retry-after' ? retryAfter ?? null : null },
    json: async () => body,
  };
}

const body = {
  model: 'jev-1.13.0',
  answers: {
    grams: { type: 'choice', choice: 'v0', confidence: 0.99, probabilities: { v0: 0.99, none: 0.01 } },
    carbohydrate: { type: 'choice', choice: 'v1', confidence: 0.99, probabilities: { v1: 0.99, none: 0.01 } },
    protein: { type: 'choice', choice: 'v2', confidence: 0.99, probabilities: { v2: 0.99, none: 0.01 } },
    fat: { type: 'choice', choice: 'v3', confidence: 0.99, probabilities: { v3: 0.99, none: 0.01 } },
  },
};

const payload = {
  model: 'jev-1.13.0' as const,
  state: { description: 'Per 100g', locale: 'en-US' as const, panel: { start: 0, end: 8 }, candidates: [] },
  questions: {} as never,
};

describe('TypeSafe nutrition client', () => {
  it('retries a 429 once with bounded delay and validates the pinned response', async () => {
    const requests: number[] = [];
    const client = createTypesafeClient({
      apiKey: 'test-key',
      request: async (_url, _init) => {
        requests.push(1);
        return requests.length === 1 ? response(429, {}, '99') : response(200, body);
      },
      sleep: async () => undefined,
    });
    const result = await client.choose(payload);
    expect(requests).toHaveLength(2);
    expect(result.response.model).toBe('jev-1.13.0');
  });

  it('does not retry unauthorized responses', async () => {
    let requests = 0;
    const client = createTypesafeClient({
      apiKey: 'test-key',
      request: async () => { requests += 1; return response(401, {}); },
      sleep: async () => undefined,
    });
    await expect(client.choose(payload)).rejects.toHaveProperty('code', 'unauthorized');
    expect(requests).toBe(1);
  });

  it('rejects malformed probability distributions before selection', async () => {
    const malformed = { ...body, answers: { ...body.answers, grams: { ...body.answers.grams, probabilities: { v0: 0.2, none: 0.2 } } } };
    const client = createTypesafeClient({ apiKey: 'test-key', request: async () => response(200, malformed) });
    await expect(client.choose(payload)).rejects.toHaveProperty('code', 'invalid_model_response');
  });
});
