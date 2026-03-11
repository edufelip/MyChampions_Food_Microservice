/**
 * Normalization pipeline for catalog queries:
 * trim -> lowercase -> accent fold -> punctuation cleanup -> whitespace collapse.
 */
export function normalizeCatalogQuery(query: string): string {
  return query
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
