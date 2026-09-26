import { parseFixedPoint } from './numeric-spans';
import { RecoveryLocale, ServingPanel, Span } from './recovery-types';

export type PanelDetection =
  | { ok: true; panel: ServingPanel }
  | { ok: false; reason: 'missing_mass' | 'multiple_panels' | 'unsupported_number' };

interface Header {
  index: number;
  end: number;
  rawMass: string;
  massStart: number;
  massEnd: number;
  unitStart: number;
  unitEnd: number;
  unit: string;
}

function headerPattern(locale: RecoveryLocale): RegExp {
  if (locale === 'en-US') return /\bper\s+([0-9][0-9.,]*)\s*([a-zµ]+)\b/giu;
  if (locale === 'pt-BR') return /\bpor(?:ção(?:\s+de)?|cao(?:\s+de)?)?\s+([0-9][0-9.,]*)\s*([a-zµ]+)\b/giu;
  return /\bpor(?:ción(?:\s+de)?|cion(?:\s+de)?)?\s+([0-9][0-9.,]*)\s*([a-zµ]+)\b/giu;
}

function isGramUnit(value: string): boolean {
  return /^(?:g|grams?|grama?s?|gramos?)$/iu.test(value);
}

function findHeaders(description: string, locale: RecoveryLocale): Header[] {
  const regex = headerPattern(locale);
  const headers: Header[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(description)) !== null) {
    const rawMass = match[1];
    const unit = match[2];
    if (!rawMass || !unit || match.index === undefined) continue;
    const massStart = match.index + match[0].indexOf(rawMass);
    const massEnd = massStart + rawMass.length;
    const unitStart = match.index + match[0].lastIndexOf(unit);
    headers.push({
      index: match.index,
      end: match.index + match[0].length,
      rawMass,
      massStart,
      massEnd,
      unitStart,
      unitEnd: unitStart + unit.length,
      unit,
    });
  }
  return headers;
}

export function detectServingPanel(description: string, locale: RecoveryLocale): PanelDetection {
  const headers = findHeaders(description, locale);
  if (headers.length === 0) return { ok: false, reason: 'missing_mass' };
  if (headers.length > 1) return { ok: false, reason: 'multiple_panels' };
  const header = headers[0] as Header;
  if (!isGramUnit(header.unit)) return { ok: false, reason: 'missing_mass' };
  const parsed = parseFixedPoint(header.rawMass, locale);
  if (!parsed) return { ok: false, reason: 'unsupported_number' };
  const massSpan: Span = {
    id: 'mass',
    start: header.massStart,
    end: header.massEnd,
    raw: header.rawMass,
    decimal: parsed.decimal,
  };
  return {
    ok: true,
    panel: {
      id: 'panel-0',
      start: header.index,
      end: description.length,
      anchorStart: header.index,
      anchorEnd: header.end,
      massSpan,
      massUnitStart: header.unitStart,
      massUnitEnd: header.unitEnd,
      massUnit: header.unit,
    },
  };
}
