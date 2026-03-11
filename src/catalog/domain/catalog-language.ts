export const CATALOG_LANGUAGES = ['en', 'pt', 'es', 'fr', 'it'] as const;

export type CatalogLanguage = (typeof CATALOG_LANGUAGES)[number];

export function isCatalogLanguage(value: string): value is CatalogLanguage {
  return CATALOG_LANGUAGES.includes(value as CatalogLanguage);
}
