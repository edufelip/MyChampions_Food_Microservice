import { RECOVERY_MODEL, TypesafeClient, TypesafePayload, TypesafeResponse } from './recovery-types';

export type TypesafeHttpResponse = {
  status: number;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
};

export type TypesafeRequest = (
  input: string,
  init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal },
) => Promise<TypesafeHttpResponse>;

export type TypesafeClientErrorCode =
  | 'missing_api_key'
  | 'provider_unavailable'
  | 'invalid_model_response'
  | 'unauthorized'
  | 'budget_exhausted';

export class TypesafeClientError extends Error {
  constructor(public readonly code: TypesafeClientErrorCode, message: string, public readonly status?: number) {
    super(message);
    this.name = 'TypesafeClientError';
  }
}

export interface TypesafeClientOptions {
  apiKey: string;
  model?: typeof RECOVERY_MODEL;
  endpoint?: string;
  timeoutMs?: number;
  request?: TypesafeRequest;
  sleep?: (ms: number) => Promise<void>;
}

function responseHeaders(response: TypesafeHttpResponse): Record<string, string> {
  const result: Record<string, string> = {};
  const retryAfter = response.headers.get('retry-after');
  if (retryAfter) result['retry-after'] = retryAfter;
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteProbability(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function validateResponse(value: unknown, expectedModel: string): TypesafeResponse {
  if (!isRecord(value) || typeof value['model'] !== 'string' || value['model'] !== expectedModel) {
    throw new TypesafeClientError('invalid_model_response', 'TypeSafe response model was not the pinned model');
  }
  const rawAnswers = value['answers'];
  const answers = isRecord(rawAnswers) && rawAnswers['carbohydrate'] === undefined && rawAnswers['carbs'] !== undefined
    ? { ...rawAnswers, carbohydrate: rawAnswers['carbs'] }
    : rawAnswers;
  if (!isRecord(answers)) throw new TypesafeClientError('invalid_model_response', 'TypeSafe response omitted answers');
  const fields = ['grams', 'carbohydrate', 'protein', 'fat'];
  if (Object.keys(answers).some((key) => !fields.includes(key) && key !== 'carbs') || fields.some((key) => !answers[key])) {
    throw new TypesafeClientError('invalid_model_response', 'TypeSafe response did not contain exactly four answers');
  }
  const normalized: TypesafeResponse['answers'] = {};
  for (const field of fields) {
    const answer = answers[field];
    if (!isRecord(answer) || answer['type'] !== 'choice' || typeof answer['choice'] !== 'string' || !isFiniteProbability(answer['confidence'])) {
      throw new TypesafeClientError('invalid_model_response', 'TypeSafe answer shape was invalid');
    }
    const probabilities = answer['probabilities'];
    if (probabilities !== undefined) {
      if (!isRecord(probabilities) || Object.values(probabilities).some((probability) => !isFiniteProbability(probability))) {
        throw new TypesafeClientError('invalid_model_response', 'TypeSafe probability map was invalid');
      }
      const numericProbabilities = Object.values(probabilities).map((probability) => Number(probability));
      const probabilityTotal = numericProbabilities.reduce((sum: number, probability: number) => sum + probability, 0);
      const selectedProbability = probabilities[answer['choice']];
      const highestProbability = Math.max(...numericProbabilities);
      if (!isFiniteProbability(selectedProbability) || Math.abs(probabilityTotal - 1) > 0.02 || selectedProbability + 0.02 < highestProbability) {
        throw new TypesafeClientError('invalid_model_response', 'TypeSafe probability map disagreed with the selected choice');
      }
    }
    normalized[field] = {
      type: 'choice',
      choice: answer['choice'],
      confidence: answer['confidence'],
      probabilities: probabilities as Record<string, number> | undefined,
    };
  }
  const usage = value['usage'];
  let normalizedUsage: TypesafeResponse['usage'];
  if (usage !== undefined) {
    if (!isRecord(usage)) throw new TypesafeClientError('invalid_model_response', 'TypeSafe usage was invalid');
    const input = usage['input_tokens'];
    const output = usage['output_tokens'];
    if ((input !== undefined && (!Number.isInteger(input) || (input as number) < 0)) || (output !== undefined && (!Number.isInteger(output) || (output as number) < 0))) {
      throw new TypesafeClientError('invalid_model_response', 'TypeSafe usage values were invalid');
    }
    normalizedUsage = { input_tokens: input as number | undefined, output_tokens: output as number | undefined };
  }
  return { model: expectedModel, answers: normalized, usage: normalizedUsage };
}

function retryDelay(response: TypesafeHttpResponse): number {
  const header = responseHeaders(response)['retry-after'];
  const seconds = header ? Number(header) : 0;
  return Number.isFinite(seconds) && seconds >= 0 ? Math.min(2_000, seconds * 1_000) : 200;
}

async function defaultSleep(ms: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export function createTypesafeClient(options: TypesafeClientOptions): TypesafeClient {
  const request: TypesafeRequest = options.request ?? (globalThis.fetch.bind(globalThis) as unknown as TypesafeRequest);
  const endpoint = options.endpoint ?? 'https://api.typesafe.ai/v1/systemone';
  const model = options.model ?? RECOVERY_MODEL;
  const timeoutMs = options.timeoutMs ?? 3_000;
  const sleep = options.sleep ?? defaultSleep;
  if (!options.apiKey.trim()) {
    throw new TypesafeClientError('missing_api_key', 'TypeSafe API key is required only for live mode');
  }

  return {
    async choose(payload: TypesafePayload): Promise<{ response: TypesafeResponse; latencyMs: number }> {
      const body = JSON.stringify({ ...payload, model });
      let attempt = 0;
      while (attempt < 2) {
        attempt += 1;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        const started = Date.now();
        try {
          const response = await request(endpoint, {
            method: 'POST',
            headers: { Authorization: `Bearer ${options.apiKey}`, 'Content-Type': 'application/json' },
            body,
            signal: controller.signal,
          });
          if (response.status === 401 || response.status === 403) {
            throw new TypesafeClientError('unauthorized', 'TypeSafe authorization failed', response.status);
          }
          if (response.status === 429 || response.status >= 500) {
            if (attempt < 2) {
              await sleep(retryDelay(response));
              continue;
            }
            throw new TypesafeClientError('provider_unavailable', 'TypeSafe provider was unavailable', response.status);
          }
          if (response.status < 200 || response.status >= 300) {
            throw new TypesafeClientError('provider_unavailable', 'TypeSafe rejected the request', response.status);
          }
          const parsed = validateResponse(await response.json(), model);
          return { response: parsed, latencyMs: Date.now() - started };
        } catch (error) {
          if (error instanceof TypesafeClientError) throw error;
          if (attempt < 2) {
            await sleep(200);
            continue;
          }
          throw new TypesafeClientError('provider_unavailable', 'TypeSafe request failed');
        } finally {
          clearTimeout(timeout);
        }
      }
      throw new TypesafeClientError('provider_unavailable', 'TypeSafe request exhausted retries');
    },
  };
}
