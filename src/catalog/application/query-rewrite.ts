import { CatalogLanguage } from '../domain/catalog-language';
import { normalizeCatalogQuery } from './query-normalizer';

interface RewriteResult {
  normalizedQuery: string;
  rewrittenFrom?: string;
}

interface RewriteCandidatesResult extends RewriteResult {
  candidateQueries: string[];
}

const PT_QUERY_ALIASES: Record<string, string[]> = {
  patinho: ['lean ground beef', 'ground beef', 'minced beef', 'beef'],
  'carne moida': ['ground beef', 'minced beef', 'lean ground beef', 'beef'],
  bife: ['beef steak', 'steak', 'beef'],
  carne: ['beef', 'meat'],
  peito: ['chicken breast', 'turkey breast'],
  'peito de frango': ['chicken breast'],
  tilapia: ['tilapia fish'],
};

export function rewriteCatalogQuery(lang: CatalogLanguage, query: string): RewriteResult {
  const rewrite = buildCatalogQueryCandidates(lang, query);
  return {
    normalizedQuery: rewrite.normalizedQuery,
    rewrittenFrom: rewrite.rewrittenFrom,
  };
}

export function buildCatalogQueryCandidates(lang: CatalogLanguage, query: string): RewriteCandidatesResult {
  const normalizedQuery = normalizeCatalogQuery(query);
  if (normalizedQuery.length === 0) {
    return { normalizedQuery, candidateQueries: [] };
  }

  if (lang !== 'pt') {
    return { normalizedQuery, candidateQueries: [normalizedQuery] };
  }

  const aliases = PT_QUERY_ALIASES[normalizedQuery] ?? [];
  const uniqueCandidates: string[] = [];
  const seen = new Set<string>();

  aliases.forEach((alias) => {
    const normalizedAlias = normalizeCatalogQuery(alias);
    if (normalizedAlias.length === 0 || seen.has(normalizedAlias)) {
      return;
    }
    seen.add(normalizedAlias);
    uniqueCandidates.push(normalizedAlias);
  });

  if (!seen.has(normalizedQuery)) {
    seen.add(normalizedQuery);
    uniqueCandidates.push(normalizedQuery);
  }

  const firstCandidate = uniqueCandidates[0] ?? normalizedQuery;
  return {
    normalizedQuery: firstCandidate,
    rewrittenFrom: firstCandidate === normalizedQuery ? undefined : normalizedQuery,
    candidateQueries: uniqueCandidates,
  };
}
