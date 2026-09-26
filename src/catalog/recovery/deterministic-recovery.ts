import { detectServingPanel } from './panel-detection';
import {
  Fields,
  NutrientField,
  NumericCandidate,
  RecoveryLocale,
  RecoveryReason,
  ServingPanel,
  Span,
} from './recovery-types';
import {
  findNumericCandidates,
  normalizeTo100,
  parseFixedPoint,
  spanFromCandidate,
  withinNutritionBounds,
} from './numeric-spans';

export interface RecoveryAnalysis {
  locale: RecoveryLocale;
  panel: ServingPanel;
  candidates: NumericCandidate[];
  spans: Span[];
  massCandidate: NumericCandidate;
  fieldCandidates: Record<Exclude<NutrientField, 'grams'>, NumericCandidate[]>;
  missingFields: Array<Exclude<NutrientField, 'grams'>>;
}

export interface SelectionValidation {
  ok: true;
  selected: Fields;
  normalized100g: { carbohydrate: string; protein: string; fat: string; serving: '100' };
  massHundredths: number;
  macroHundredths: { carbohydrate: number; protein: number; fat: number };
}

export interface SelectionFailure {
  ok: false;
  reason: Extract<RecoveryReason, 'no_selection' | 'invalid_model_response' | 'invalid_bounds' | 'missing_macro'>;
}

export type SelectionResult = SelectionValidation | SelectionFailure;

const FIELD_LABELS: Record<Exclude<NutrientField, 'grams'>, RegExp[]> = {
  carbohydrate: [
    /\bcarbohydrates?\b/giu,
    /\bcarbs?\b/giu,
    /\bcarboidratos?\b/giu,
    /\bcarbohidratos?\b/giu,
    /\bhidratos?\s+de\s+carbono\b/giu,
  ],
  protein: [
    /\bproteins?\b/giu,
    /\bprote[ií]nas?\b/giu,
  ],
  fat: [
    /\btotal\s+fat\b/giu,
    /\bfat\b/giu,
    /\bgorduras?\b/giu,
    /\bgrasas?\b/giu,
  ],
};

function isDistractorLabel(description: string, index: number, field: 'fat'): boolean {
  const before = description.slice(Math.max(0, index - 24), index).toLocaleLowerCase();
  return field === 'fat' && /(?:saturated|trans|polyunsaturated|monounsaturated|saturad[ao]|trans)/u.test(before);
}

function candidatesAfterLabel(
  description: string,
  labelEnd: number,
  candidates: NumericCandidate[],
  panel: ServingPanel,
  field: Exclude<NutrientField, 'grams'>,
): NumericCandidate | null {
  const candidate = candidates.find((entry) => {
    if (entry.start < labelEnd || entry.start < panel.start || entry.end > panel.end) return false;
    const between = description.slice(labelEnd, entry.start);
    if (between.match(/\d/)) return false;
    if (between.length > 80 || /[;|]/u.test(between)) return false;
    if (/(?:carboidr|carbohyd|carb|protein|prote[ií]n|gordur|gras|fat|sugar|a[cç]úcar|az[uú]car)\w*/iu.test(between)) return false;
    if (field === 'fat' && /(?:saturad|trans|polyunsaturated|monounsaturated)/iu.test(between)) return false;
    return true;
  });
  return candidate ?? null;
}

function collectFieldCandidates(
  description: string,
  field: Exclude<NutrientField, 'grams'>,
  candidates: NumericCandidate[],
  panel: ServingPanel,
): NumericCandidate[] {
  const matches: NumericCandidate[] = [];
  for (const pattern of FIELD_LABELS[field]) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(description)) !== null) {
      if (match.index < panel.start || match.index >= panel.end) continue;
      if (field === 'fat' && isDistractorLabel(description, match.index, field)) continue;
      const candidate = candidatesAfterLabel(description, match.index + match[0].length, candidates, panel, field);
      if (candidate && !matches.some((entry) => entry.id === candidate.id)) matches.push(candidate);
    }
  }
  return matches;
}

export function analyzeDescription(description: string, locale: RecoveryLocale):
  | { ok: true; analysis: RecoveryAnalysis }
  | { ok: false; reason: Extract<RecoveryReason, 'missing_mass' | 'multiple_panels' | 'unsupported_number' | 'too_many_candidates'> } {
  const detection = detectServingPanel(description, locale);
  if (!detection.ok) return detection;
  const scan = findNumericCandidates(
    description,
    locale,
    detection.panel.start,
    detection.panel.end,
    detection.panel.id,
  );
  if (scan.unsupported) return { ok: false, reason: 'unsupported_number' };
  if (scan.candidates.length > 100) return { ok: false, reason: 'too_many_candidates' };
  const massCandidate = scan.candidates.find((candidate) => candidate.start === detection.panel.massSpan.start);
  if (!massCandidate) return { ok: false, reason: 'unsupported_number' };

  const fieldCandidates = {
    carbohydrate: collectFieldCandidates(description, 'carbohydrate', scan.candidates, detection.panel),
    protein: collectFieldCandidates(description, 'protein', scan.candidates, detection.panel),
    fat: collectFieldCandidates(description, 'fat', scan.candidates, detection.panel),
  };
  const missingFields = (['carbohydrate', 'protein', 'fat'] as const).filter(
    (field) => fieldCandidates[field].length === 0,
  );
  return {
    ok: true,
    analysis: {
      locale,
      panel: detection.panel,
      candidates: scan.candidates,
      spans: scan.candidates.map(spanFromCandidate),
      massCandidate,
      fieldCandidates,
      missingFields,
    },
  };
}

export function deterministicSelection(analysis: RecoveryAnalysis): SelectionResult {
  if (analysis.missingFields.length > 0) return { ok: false, reason: 'missing_macro' };
  const carbohydrate = analysis.fieldCandidates.carbohydrate;
  const protein = analysis.fieldCandidates.protein;
  const fat = analysis.fieldCandidates.fat;
  if (carbohydrate.length !== 1 || protein.length !== 1 || fat.length !== 1) {
    return { ok: false, reason: 'no_selection' };
  }
  return validateSelection(analysis, {
    grams: analysis.massCandidate.id,
    carbohydrate: carbohydrate[0]?.id ?? 'none',
    protein: protein[0]?.id ?? 'none',
    fat: fat[0]?.id ?? 'none',
  });
}

export function validateSelection(analysis: RecoveryAnalysis, selected: Fields): SelectionResult {
  const ids = [selected.grams, selected.carbohydrate, selected.protein, selected.fat];
  if (ids.some((id) => id === 'none' || typeof id !== 'string')) return { ok: false, reason: 'no_selection' };
  if (new Set(ids).size !== ids.length) return { ok: false, reason: 'invalid_model_response' };
  const byId = new Map(analysis.candidates.map((candidate) => [candidate.id, candidate]));
  const chosen = ids.map((id) => byId.get(id));
  if (chosen.some((candidate) => !candidate)) return { ok: false, reason: 'invalid_model_response' };
  const [massCandidate, carbCandidate, proteinCandidate, fatCandidate] = chosen as NumericCandidate[];
  if (massCandidate.id !== analysis.massCandidate.id || massCandidate.panelId !== analysis.panel.id) {
    return { ok: false, reason: 'invalid_model_response' };
  }
  if (!analysis.fieldCandidates.carbohydrate.some((candidate) => candidate.id === carbCandidate.id) ||
      !analysis.fieldCandidates.protein.some((candidate) => candidate.id === proteinCandidate.id) ||
      !analysis.fieldCandidates.fat.some((candidate) => candidate.id === fatCandidate.id)) {
    return { ok: false, reason: 'invalid_model_response' };
  }
  const mass = parseFixedPoint(massCandidate.raw, analysis.locale);
  const carbohydrate = parseFixedPoint(carbCandidate.raw, analysis.locale);
  const protein = parseFixedPoint(proteinCandidate.raw, analysis.locale);
  const fat = parseFixedPoint(fatCandidate.raw, analysis.locale);
  if (!mass || !carbohydrate || !protein || !fat) return { ok: false, reason: 'invalid_model_response' };
  const macroHundredths = {
    carbohydrate: carbohydrate.hundredths,
    protein: protein.hundredths,
    fat: fat.hundredths,
  };
  if (!withinNutritionBounds(mass.hundredths, macroHundredths)) return { ok: false, reason: 'invalid_bounds' };
  return {
    ok: true,
    selected,
    massHundredths: mass.hundredths,
    macroHundredths,
    normalized100g: {
      carbohydrate: normalizeTo100(mass.hundredths, carbohydrate.hundredths),
      protein: normalizeTo100(mass.hundredths, protein.hundredths),
      fat: normalizeTo100(mass.hundredths, fat.hundredths),
      serving: '100',
    },
  };
}
