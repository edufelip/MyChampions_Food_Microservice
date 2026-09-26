import { TypesafeClientError, TypesafeHttpResponse, TypesafeRequest } from './typesafe-client';

export interface LiveBudgetState {
  remainingRequests: number;
  remainingInputTokens: number;
  providerCalls: number;
  authFailed: boolean;
}

export interface BudgetedRequestOptions {
  request: TypesafeRequest;
  maxRequests: number;
  maxInputTokens: number;
}

export interface BudgetedRequest {
  request: TypesafeRequest;
  state(): LiveBudgetState;
}

/**
 * Enforce a run-level request/input budget around the provider transport.
 * Input reservations use UTF-8 bytes as a conservative token upper bound and
 * are reconciled against provider-reported input usage after JSON is consumed.
 */
export function createBudgetedRequest(options: BudgetedRequestOptions): BudgetedRequest {
  let remainingRequests = options.maxRequests;
  let remainingInputTokens = options.maxInputTokens;
  let providerCalls = 0;
  let authFailed = false;

  const request: TypesafeRequest = async (input, init): Promise<TypesafeHttpResponse> => {
    if (authFailed) throw new TypesafeClientError('unauthorized', 'TypeSafe authorization failed earlier in this run');
    if (remainingRequests <= 0) throw new TypesafeClientError('budget_exhausted', 'request budget exhausted');
    const reservedInputTokens = Math.max(1, Buffer.byteLength(init.body, 'utf8'));
    if (remainingInputTokens < reservedInputTokens) throw new TypesafeClientError('budget_exhausted', 'input token budget exhausted');
    remainingRequests -= 1;
    remainingInputTokens -= reservedInputTokens;
    providerCalls += 1;

    const response = await options.request(input, init);
    if (response.status === 401 || response.status === 403) authFailed = true;
    const originalJson = response.json.bind(response);
    let parsed: unknown;
    let parsedReady = false;
    return {
      // Fetch Response.status and Response.headers are prototype accessors, not
      // enumerable own properties. Copy the typed surface explicitly so the
      // client still sees real transport status and retry headers.
      status: response.status,
      headers: response.headers,
      json: async () => {
        if (!parsedReady) {
          parsed = await originalJson();
          parsedReady = true;
          const usage = isRecord(parsed) && isRecord(parsed['usage']) ? parsed['usage']['input_tokens'] : undefined;
          if (Number.isInteger(usage) && (usage as number) >= 0) {
            remainingInputTokens += reservedInputTokens - (usage as number);
          }
        }
        return parsed;
      },
    };
  };

  return {
    request,
    state: () => ({ remainingRequests, remainingInputTokens, providerCalls, authFailed }),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
