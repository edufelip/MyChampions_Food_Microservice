import { NumericCandidate, RecoveryLocale, Span } from './recovery-types';

export interface FixedPoint {
  hundredths: number;
  decimal: string;
}

export interface NumericScan {
  candidates: NumericCandidate[];
  unsupported: boolean;
}

const NUMERIC_TOKEN = /\d+(?:[.,]\d+)?/g;

function decimalSeparator(locale: RecoveryLocale): '.' | ',' {
  return locale === 'en-US' ? '.' : ',';
}

export function parseFixedPoint(raw: string, locale: RecoveryLocale): FixedPoint | null {
  const value = raw.trim();
  if (!/^\d+(?:[.,]\d+)?$/.test(value)) return null;
  const separator = decimalSeparator(locale);
  const separators = [...value].filter((character) => character === '.' || character === ',');
  if (separators.some((character) => character !== separator)) return null;
  if (separators.length > 1) return null;
  const [whole, fraction = ''] = value.split(separator);
  if (fraction.length > 2) return null;
  const wholeNumber = Number(whole);
  if (!Number.isSafeInteger(wholeNumber)) return null;
  const hundredths = wholeNumber * 100 + Number((fraction + '00').slice(0, 2));
  if (!Number.isSafeInteger(hundredths)) return null;
  return {
    hundredths,
    decimal: fraction.length > 0 ? `${whole}.${fraction}` : whole,
  };
}

function isNumberContinuation(description: string, start: number, end: number): boolean {
  const before = description[start - 1] ?? '';
  const after = description[end] ?? '';
  if (before === '+' || before === '-' || before === '−' || before === '<' || before === '>') return true;
  if (after === '/' || before === '/' || after === '−' || before === '−' || after === '-' || after === '–' || after === '—' || before === '–' || before === '—') return true;
  if (before === '-' || after === '+') return true;
  if (/[eE]/.test(before) || /[eE]/.test(after)) return true;
  if ((after === '.' || after === ',') && /\d/.test(description[end + 1] ?? '')) return true;
  if ((before === '.' || before === ',') && /\d/.test(description[start - 2] ?? '')) return true;
  return false;
}

function isGroupedOrAmbiguous(raw: string): boolean {
  if (!raw.includes('.') && !raw.includes(',')) return false;
  if (raw.includes('.') && raw.includes(',')) return true;
  const separatorIndex = Math.max(raw.lastIndexOf('.'), raw.lastIndexOf(','));
  return raw.length - separatorIndex - 1 > 2;
}

function unitAfter(description: string, end: number): { unit: string; unitStart: number; unitEnd: number } | null {
  const suffix = description.slice(end);
  const match = suffix.match(/^\s*(g|grams?|grama?s?|gramos?)\b/iu);
  if (!match || match.index === undefined) return null;
  const whitespaceLength = match[0].length - match[1].length;
  const unitStart = end + whitespaceLength;
  return { unit: match[1], unitStart, unitEnd: unitStart + match[1].length };
}

export function findNumericCandidates(
  description: string,
  locale: RecoveryLocale,
  panelStart: number,
  panelEnd: number,
  panelId: string,
): NumericScan {
  const candidates: NumericCandidate[] = [];
  let unsupported = false;
  const scoped = description.slice(panelStart, panelEnd);
  const regex = new RegExp(NUMERIC_TOKEN.source, 'g');
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = regex.exec(scoped)) !== null) {
    const raw = match[0];
    const start = panelStart + match.index;
    const end = start + raw.length;
    if (isNumberContinuation(description, start, end) || isGroupedOrAmbiguous(raw)) {
      unsupported = true;
      continue;
    }
    const parsed = parseFixedPoint(raw, locale);
    if (!parsed) {
      unsupported = true;
      continue;
    }
    const unit = unitAfter(description, end);
    if (!unit) continue;
    candidates.push({
      id: `v${index}`,
      start,
      end,
      raw,
      decimal: parsed.decimal,
      panelId,
      ...unit,
    });
    index += 1;
  }

  // A slash/range/exponent can leave no direct token pair in a one-character panel.
  // Keep the explicit token boundary check deterministic without attempting recovery.
  if (description.slice(panelStart, panelEnd).match(/[+\-−]\s*\d|\d\s*[-−–—]\s*\d|\d\s*\/\s*\d|\d\s*[eE][+-]?\s*\d|[<>]\s*\d/)) {
    unsupported = true;
  }
  return { candidates, unsupported };
}

export function spanFromCandidate(candidate: NumericCandidate): Span {
  return {
    id: candidate.id,
    start: candidate.start,
    end: candidate.end,
    raw: candidate.raw,
    decimal: candidate.decimal,
  };
}

export function formatHundredths(value: number): string {
  const whole = Math.floor(value / 100);
  const fraction = String(value % 100).padStart(2, '0');
  return `${whole}.${fraction}`;
}

export function roundHalfUp(numerator: number, denominator: number): number {
  if (denominator <= 0) throw new Error('denominator must be positive');
  return Math.floor((numerator * 2 + denominator) / (2 * denominator));
}

export function normalizeTo100(massHundredths: number, macroHundredths: number): string {
  return formatHundredths(roundHalfUp(macroHundredths * 10_000, massHundredths));
}

export function withinNutritionBounds(
  massHundredths: number,
  macroHundredths: { carbohydrate: number; protein: number; fat: number },
): boolean {
  if (massHundredths <= 0 || massHundredths > 1_000_000) return false;
  const values = [macroHundredths.carbohydrate, macroHundredths.protein, macroHundredths.fat];
  if (values.some((value) => value < 0 || value > massHundredths)) return false;
  const tolerance = Math.max(50, Math.floor(massHundredths / 100));
  return values.reduce((sum, value) => sum + value, 0) <= massHundredths + tolerance;
}
