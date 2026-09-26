import { mapFatSecretResponse } from '../../fatsecret/response-mapper';
import { analyzeDescription, deterministicSelection, validateSelection } from './deterministic-recovery';
import { buildTypesafePayload } from './build-questions';
import {
  RECOVERY_POLICY_VERSION,
  RECOVERY_PROMPT_VERSION,
  RECOVERY_RESULT_SCHEMA,
  RecoveryResultV1,
  RecoverySource,
  TypesafeClient,
  TypesafeResponse,
} from './recovery-types';
import { sha256 } from './source-validation';
import { TypesafeClientError } from './typesafe-client';

export interface RecoveryOptions {
  runId: string;
  client?: TypesafeClient;
  minConfidence?: number;
  /** Preserve a run-level provider stop reason when no further provider call is allowed. */
  providerFailureReason?: 'unauthorized' | 'budget_exhausted' | 'provider_unavailable';
}

function baseResult(source: RecoverySource, runId: string): RecoveryResultV1 {
  return {
    schemaVersion: RECOVERY_RESULT_SCHEMA,
    sourceId: source.sourceId,
    sourceHash: sha256(source),
    runId,
    status: 'abstained',
    reason: 'no_selection',
    method: 'none',
    spans: [],
    promptVersion: RECOVERY_PROMPT_VERSION,
    policyVersion: RECOVERY_POLICY_VERSION,
  };
}

function failureStatus(reason: RecoveryResultV1['reason']): RecoveryResultV1['status'] {
  if (reason === 'invalid_schema' || reason === 'duplicate_conflict') return 'invalid_input';
  if (reason === 'unsupported_number' || reason === 'invalid_unit' || reason === 'invalid_bounds') return 'rejected';
  if (reason === 'provider_unavailable' || reason === 'unauthorized' || reason === 'budget_exhausted' || reason === 'invalid_model_response') return 'service_failure';
  return 'abstained';
}

function withFailure(source: RecoverySource, runId: string, reason: RecoveryResultV1['reason'], spans: RecoveryResultV1['spans'] = []): RecoveryResultV1 {
  return { ...baseResult(source, runId), status: failureStatus(reason), reason, spans };
}

function responseAnswers(response: TypesafeResponse): TypesafeResponse['answers'] {
  if (response.answers['carbohydrate']) return response.answers;
  if (!response.answers['carbs']) return response.answers;
  return { ...response.answers, carbohydrate: response.answers['carbs'] };
}

function suggestionHash(source: RecoverySource, selected: RecoveryResultV1['selected'], normalized100g: RecoveryResultV1['normalized100g'], model?: string): string {
  return sha256({
    source: sha256(source),
    selected,
    normalized100g,
    model: model ?? null,
    promptVersion: RECOVERY_PROMPT_VERSION,
    policyVersion: RECOVERY_POLICY_VERSION,
  });
}

export async function recoverDescription(source: RecoverySource, options: RecoveryOptions): Promise<RecoveryResultV1> {
  const accepted = mapFatSecretResponse({ foods: { food: source.food } });
  if (accepted.length > 0) {
    return {
      ...baseResult(source, options.runId),
      status: 'already_accepted',
      reason: 'valid_existing_mapping',
      method: 'existing',
    };
  }

  const analysisResult = analyzeDescription(source.food.food_description, source.locale);
  if (!analysisResult.ok) return withFailure(source, options.runId, analysisResult.reason);
  const analysis = analysisResult.analysis;
  const spans = analysis.spans;

  const deterministic = deterministicSelection(analysis);
  if (deterministic.ok) {
    return {
      ...baseResult(source, options.runId),
      status: 'suggested',
      reason: 'complete_proposal',
      method: 'deterministic',
      spans,
      selected: deterministic.selected,
      normalized100g: deterministic.normalized100g,
      suggestionHash: suggestionHash(source, deterministic.selected, deterministic.normalized100g),
      checks: ['single serving panel', 'explicit gram units', 'fixed-point normalization', 'nutrition bounds'],
    };
  }

  if (!options.client) return withFailure(source, options.runId, options.providerFailureReason ?? deterministic.reason, spans);

  let modelResult: Awaited<ReturnType<TypesafeClient['choose']>>;
  try {
    modelResult = await options.client.choose(buildTypesafePayload(source.food.food_description, analysis));
  } catch (error) {
    const reason = error instanceof TypesafeClientError && error.code === 'invalid_model_response'
      ? 'invalid_model_response'
      : error instanceof TypesafeClientError && error.code === 'budget_exhausted'
        ? 'budget_exhausted'
        : error instanceof TypesafeClientError && error.code === 'unauthorized'
          ? 'unauthorized'
        : 'provider_unavailable';
    return withFailure(source, options.runId, reason, spans);
  }
  const answers = responseAnswers(modelResult.response);
  const fields = {
    grams: answers['grams']?.choice ?? 'none',
    carbohydrate: answers['carbohydrate']?.choice ?? 'none',
    protein: answers['protein']?.choice ?? 'none',
    fat: answers['fat']?.choice ?? 'none',
  };
  if (Object.values(fields).some((choice) => choice === 'none')) {
    const result = withFailure(source, options.runId, 'no_selection', spans);
    return { ...result, method: 'typesafe', model: modelResult.response.model, latencyMs: modelResult.latencyMs, ...usageMetadata(modelResult.response) };
  }
  const minConfidence = options.minConfidence ?? 0.9;
  const confidences = ['grams', 'carbohydrate', 'protein', 'fat'].map((field) => answers[field]?.confidence ?? 0);
  const measuredMinConfidence = Math.min(...confidences);
  if (measuredMinConfidence < minConfidence) {
    const result = withFailure(source, options.runId, 'low_confidence', spans);
    return {
      ...result,
      method: 'typesafe',
      model: modelResult.response.model,
      minConfidence: measuredMinConfidence,
      latencyMs: modelResult.latencyMs,
      ...usageMetadata(modelResult.response),
    };
  }
  const validated = validateSelection(analysis, fields);
  if (!validated.ok) {
    const result = withFailure(source, options.runId, validated.reason, spans);
    return {
      ...result,
      method: 'typesafe',
      model: modelResult.response.model,
      minConfidence: measuredMinConfidence,
      latencyMs: modelResult.latencyMs,
      ...usageMetadata(modelResult.response),
    };
  }
  return {
    ...baseResult(source, options.runId),
    status: 'suggested',
    reason: 'complete_proposal',
    method: 'typesafe',
    spans,
    selected: validated.selected,
    normalized100g: validated.normalized100g,
    model: modelResult.response.model,
    promptVersion: RECOVERY_PROMPT_VERSION,
    policyVersion: RECOVERY_POLICY_VERSION,
    minConfidence: measuredMinConfidence,
    latencyMs: modelResult.latencyMs,
    ...usageMetadata(modelResult.response),
    suggestionHash: suggestionHash(source, validated.selected, validated.normalized100g, modelResult.response.model),
    checks: ['single serving panel', 'existing span IDs', 'explicit gram units', 'fixed-point normalization', 'nutrition bounds'],
  };
}

function usageMetadata(response: TypesafeResponse): Pick<RecoveryResultV1, 'usage'> {
  const usage = response.usage;
  return usage ? {
    usage: {
      inputTokens: usage.input_tokens ?? 0,
      outputTokens: usage.output_tokens ?? 0,
    },
  } : {};
}
