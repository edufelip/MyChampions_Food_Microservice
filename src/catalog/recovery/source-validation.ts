import { createHash } from 'node:crypto';
import {
  RECOVERY_INPUT_SCHEMA,
  RECOVERY_LOCALES,
  RecoveryFood,
  RecoveryInputV1,
  RecoveryServing,
  RecoverySource,
  ValidationFailure,
  ValidationResult,
} from './recovery-types';

const MAX_SOURCE_ID_LENGTH = 128;
const MAX_NAME_LENGTH = 256;
const MAX_DESCRIPTION_LENGTH = 4096;
const ROOT_KEYS = new Set(['schemaVersion', 'sourceId', 'locale', 'food']);
const FOOD_KEYS = new Set(['food_id', 'food_name', 'food_description', 'servings']);
const SERVINGS_KEYS = new Set(['serving']);
const SERVING_KEYS = new Set([
  'metric_serving_amount',
  'metric_serving_unit',
  'carbohydrate',
  'protein',
  'fat',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: Set<string>): boolean {
  return Object.keys(value).every((key) => keys.has(key));
}

function isSafeScalar(value: unknown): value is string | number {
  if (typeof value === 'number') return Number.isFinite(value);
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 128;
}

function sanitizeServing(value: unknown): RecoveryServing | null {
  if (!isRecord(value) || !hasOnlyKeys(value, SERVING_KEYS)) return null;

  const serving: RecoveryServing = {};
  for (const key of SERVING_KEYS) {
    const raw = value[key];
    if (raw === undefined) continue;
    if (key === 'metric_serving_unit') {
      if (typeof raw !== 'string' || raw.trim().length === 0 || raw.length > 32) return null;
      serving.metric_serving_unit = raw;
    } else {
      if (!isSafeScalar(raw)) return null;
      (serving as Record<string, string | number>)[key] = raw;
    }
  }
  return serving;
}

function sanitizeFood(value: unknown): RecoveryFood | null {
  if (!isRecord(value) || !hasOnlyKeys(value, FOOD_KEYS)) return null;
  const foodId = value['food_id'];
  const foodName = value['food_name'];
  const description = value['food_description'];
  if (
    typeof foodId !== 'string' ||
    foodId.length < 1 ||
    foodId.length > 128 ||
    typeof foodName !== 'string' ||
    foodName.trim().length < 1 ||
    foodName.length > MAX_NAME_LENGTH ||
    typeof description !== 'string' ||
    description.length < 1 ||
    description.length > MAX_DESCRIPTION_LENGTH
  ) {
    return null;
  }

  const food: RecoveryFood = {
    food_id: foodId,
    food_name: foodName,
    food_description: description,
  };
  if (value['servings'] === undefined) return food;

  const servings = value['servings'];
  if (!isRecord(servings) || !hasOnlyKeys(servings, SERVINGS_KEYS) || !('serving' in servings)) {
    return null;
  }
  const rawServings = Array.isArray(servings['serving']) ? servings['serving'] : [servings['serving']];
  if (rawServings.length === 0) return null;
  const sanitized = rawServings.map(sanitizeServing);
  if (sanitized.some((entry): entry is null => entry === null)) return null;
  food.servings = { serving: sanitized.length === 1 ? sanitized[0] as RecoveryServing : sanitized as RecoveryServing[] };
  return food;
}

export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isRecord(value)) {
    return Object.keys(value)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        result[key] = canonicalize(value[key]);
        return result;
      }, {});
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function sha256(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

export function sourceHash(source: RecoverySource): string {
  return sha256(source);
}

function failure(sourceId: string, reason: ValidationFailure['reason'], message: string, lineNumber?: number): ValidationFailure {
  return {
    ok: false,
    sourceId,
    reason,
    message,
    sourceHash: sha256({ lineNumber: lineNumber ?? null, reason, sourceId, message }),
  };
}

export function validateRecoveryInput(value: unknown, lineNumber = 1): ValidationResult {
  if (!isRecord(value) || !hasOnlyKeys(value, ROOT_KEYS)) {
    return failure(`invalid-line-${lineNumber}`, 'invalid_schema', 'record has an unsupported envelope');
  }
  if (value['schemaVersion'] !== RECOVERY_INPUT_SCHEMA) {
    return failure(String(value['sourceId'] ?? `invalid-line-${lineNumber}`), 'invalid_schema', 'unsupported schemaVersion');
  }
  const sourceId = value['sourceId'];
  if (typeof sourceId !== 'string' || sourceId.length < 1 || sourceId.length > MAX_SOURCE_ID_LENGTH) {
    return failure(`invalid-line-${lineNumber}`, 'invalid_schema', 'sourceId must be 1..128 characters');
  }
  const locale = value['locale'];
  if (typeof locale !== 'string' || !(RECOVERY_LOCALES as readonly string[]).includes(locale)) {
    return failure(sourceId, 'invalid_schema', 'locale must be en-US, pt-BR, or es-ES');
  }
  const food = sanitizeFood(value['food']);
  if (!food) return failure(sourceId, 'invalid_schema', 'food does not match the strict allowlist');

  const source: RecoveryInputV1 = {
    schemaVersion: RECOVERY_INPUT_SCHEMA,
    sourceId,
    locale: locale as RecoveryInputV1['locale'],
    food,
  };
  return { ok: true, source, sourceHash: sourceHash(source) };
}

export function invalidLineHash(lineNumber: number, message: string): string {
  return sha256({ lineNumber, reason: 'invalid_schema', message });
}
