export const RECOVERY_INPUT_SCHEMA = 'nutrition-recovery-input.v1' as const;
export const RECOVERY_RESULT_SCHEMA = 'nutrition-recovery-result.v1' as const;
export const RECOVERY_MODEL = 'jev-1.13.0' as const;
export const RECOVERY_PROMPT_VERSION = 'nutrition-recovery-prompt.v1' as const;
export const RECOVERY_POLICY_VERSION = 'nutrition-recovery-policy.v1' as const;

export type RecoveryLocale = 'en-US' | 'pt-BR' | 'es-ES';
export const RECOVERY_LOCALES: readonly RecoveryLocale[] = ['en-US', 'pt-BR', 'es-ES'];

export type RecoveryReason =
  | 'valid_existing_mapping'
  | 'invalid_schema'
  | 'duplicate_conflict'
  | 'unsupported_number'
  | 'missing_mass'
  | 'multiple_panels'
  | 'missing_macro'
  | 'invalid_unit'
  | 'invalid_bounds'
  | 'too_many_candidates'
  | 'no_selection'
  | 'low_confidence'
  | 'invalid_model_response'
  | 'provider_unavailable'
  | 'unauthorized'
  | 'budget_exhausted'
  | 'complete_proposal';

export type RecoveryStatus =
  | 'already_accepted'
  | 'invalid_input'
  | 'rejected'
  | 'abstained'
  | 'service_failure'
  | 'suggested';

export type RecoveryMethod = 'existing' | 'deterministic' | 'typesafe' | 'none';
export type NutrientField = 'grams' | 'carbohydrate' | 'protein' | 'fat';
export const NUTRIENT_FIELDS: readonly NutrientField[] = [
  'grams',
  'carbohydrate',
  'protein',
  'fat',
];

export type RawServingValue = string | number;

export interface RecoveryServing {
  metric_serving_amount?: RawServingValue;
  metric_serving_unit?: string;
  carbohydrate?: RawServingValue;
  protein?: RawServingValue;
  fat?: RawServingValue;
}

export interface RecoveryFood {
  food_id: string;
  food_name: string;
  food_description: string;
  servings?: { serving: RecoveryServing | RecoveryServing[] };
}

export interface RecoveryInputV1 {
  schemaVersion: typeof RECOVERY_INPUT_SCHEMA;
  sourceId: string;
  locale: RecoveryLocale;
  food: RecoveryFood;
}

export interface RecoverySource {
  schemaVersion: typeof RECOVERY_INPUT_SCHEMA;
  sourceId: string;
  locale: RecoveryLocale;
  food: RecoveryFood;
}

export interface Span {
  id: string;
  start: number;
  end: number;
  raw: string;
  decimal: string;
}

export interface NumericCandidate extends Span {
  panelId: string;
  unitStart: number;
  unitEnd: number;
  unit: string;
  field?: NutrientField;
}

export interface ServingPanel {
  id: string;
  start: number;
  end: number;
  anchorStart: number;
  anchorEnd: number;
  massSpan: Span;
  massUnitStart: number;
  massUnitEnd: number;
  massUnit: string;
}

export interface Fields {
  grams: string;
  carbohydrate: string;
  protein: string;
  fat: string;
}

export interface NormalizedNutrition {
  carbohydrate: string;
  protein: string;
  fat: string;
  serving: '100';
}

export interface RecoveryResultV1 {
  schemaVersion: typeof RECOVERY_RESULT_SCHEMA;
  sourceId: string;
  sourceHash: string;
  runId: string;
  status: RecoveryStatus;
  reason: RecoveryReason;
  method: RecoveryMethod;
  spans: Span[];
  selected?: Fields;
  normalized100g?: NormalizedNutrition;
  model?: string;
  promptVersion: string;
  policyVersion: string;
  minConfidence?: number;
  latencyMs?: number;
  usage?: { inputTokens: number; outputTokens: number };
  suggestionHash?: string;
  checks?: string[];
}

export interface ValidationSuccess {
  ok: true;
  source: RecoverySource;
  sourceHash: string;
}

export interface ValidationFailure {
  ok: false;
  sourceId: string;
  sourceHash: string;
  reason: 'invalid_schema' | 'duplicate_conflict';
  message: string;
}

export type ValidationResult = ValidationSuccess | ValidationFailure;

export interface ChoiceQuestion {
  type: 'choice';
  instructions: string;
  criteria: Record<string, unknown>;
}

export interface TypesafeQuestionState {
  description: string;
  locale: RecoveryLocale;
  panel: { start: number; end: number };
  candidates: Array<Pick<NumericCandidate, 'id' | 'start' | 'end' | 'raw' | 'decimal' | 'unit'>>;
}

export interface TypesafePayload {
  model: typeof RECOVERY_MODEL;
  state: TypesafeQuestionState;
  questions: Record<NutrientField, ChoiceQuestion>;
}

export interface TypesafeAnswer {
  type: 'choice';
  choice: string;
  confidence: number;
  probabilities?: Record<string, number>;
}

export interface TypesafeResponse {
  model: string;
  answers: Record<string, TypesafeAnswer>;
  usage?: { input_tokens?: number; output_tokens?: number };
}

export interface TypesafeClient {
  choose(payload: TypesafePayload): Promise<{ response: TypesafeResponse; latencyMs: number }>;
}

export function isRecoveryLocale(value: unknown): value is RecoveryLocale {
  return typeof value === 'string' && (RECOVERY_LOCALES as readonly string[]).includes(value);
}

export function isRecoveryResult(value: unknown): value is RecoveryResultV1 {
  if (!value || typeof value !== 'object') return false;
  const result = value as Partial<RecoveryResultV1>;
  return (
    result.schemaVersion === RECOVERY_RESULT_SCHEMA &&
    typeof result.sourceId === 'string' &&
    typeof result.sourceHash === 'string' &&
    typeof result.runId === 'string' &&
    typeof result.status === 'string' &&
    typeof result.reason === 'string' &&
    typeof result.method === 'string' &&
    Array.isArray(result.spans)
  );
}
