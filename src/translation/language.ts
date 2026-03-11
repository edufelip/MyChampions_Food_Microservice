const LANGUAGE_CODE_PATTERN = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;

export function normalizeLanguageCode(input: string): string {
  const trimmed = input.trim();
  if (trimmed.length === 0) return 'en';

  if (!LANGUAGE_CODE_PATTERN.test(trimmed)) {
    return 'en';
  }

  try {
    const [canonical] = Intl.getCanonicalLocales(trimmed);
    if (canonical) return canonical;
  } catch {
    // Fall through to best-effort normalization.
  }

  const segments = trimmed.split('-');
  return segments
    .map((segment, index) => {
      if (index === 0) return segment.toLowerCase();
      if (segment.length === 2) return segment.toUpperCase();
      if (segment.length === 4) {
        return segment[0]?.toUpperCase() + segment.slice(1).toLowerCase();
      }
      return segment;
    })
    .join('-');
}

export function isEnglishLanguage(languageCode: string): boolean {
  const normalized = normalizeLanguageCode(languageCode).toLowerCase();
  return normalized === 'en' || normalized.startsWith('en-');
}
