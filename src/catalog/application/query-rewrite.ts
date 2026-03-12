import { CatalogLanguage } from '../domain/catalog-language';
import { normalizeCatalogQuery } from './query-normalizer';

interface RewriteResult {
  normalizedQuery: string;
  rewrittenFrom?: string;
}

const PT_QUERY_ALIASES: Record<string, string> = {
  patinho: 'lean ground beef',
  'carne moida': 'ground beef',
};

export function rewriteCatalogQuery(lang: CatalogLanguage, query: string): RewriteResult {
  const normalizedQuery = normalizeCatalogQuery(query);
  if (lang !== 'pt') {
    return { normalizedQuery };
  }

  const rewritten = PT_QUERY_ALIASES[normalizedQuery];
  if (!rewritten) {
    return { normalizedQuery };
  }

  const normalizedRewrite = normalizeCatalogQuery(rewritten);
  if (normalizedRewrite.length === 0 || normalizedRewrite === normalizedQuery) {
    return { normalizedQuery };
  }

  return {
    normalizedQuery: normalizedRewrite,
    rewrittenFrom: normalizedQuery,
  };
}
