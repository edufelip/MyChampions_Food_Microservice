import { buildCatalogQueryCandidates, rewriteCatalogQuery } from '../../catalog/application/query-rewrite';

describe('query-rewrite', () => {
  it('rewrites patinho to carne moida for pt', () => {
    expect(rewriteCatalogQuery('pt', 'Patinho')).toEqual({
      normalizedQuery: 'carne moida',
      rewrittenFrom: 'patinho',
    });
  });

  it('normalizes and rewrites carne moída to carne bovina moida for pt', () => {
    expect(rewriteCatalogQuery('pt', 'Carne Moída')).toEqual({
      normalizedQuery: 'carne bovina moida',
      rewrittenFrom: 'carne moida',
    });
  });

  it('does not rewrite non-pt queries', () => {
    expect(rewriteCatalogQuery('en', 'patinho')).toEqual({
      normalizedQuery: 'patinho',
    });
  });

  it('builds fallback candidates for Portuguese aliases', () => {
    expect(buildCatalogQueryCandidates('pt', 'Bife')).toEqual({
      normalizedQuery: 'beef steak',
      rewrittenFrom: 'bife',
      candidateQueries: ['beef steak', 'steak', 'beef', 'bife'],
    });
  });

  it('builds pt-first fallback candidates for patinho', () => {
    expect(buildCatalogQueryCandidates('pt', 'Patinho')).toEqual({
      normalizedQuery: 'carne moida',
      rewrittenFrom: 'patinho',
      candidateQueries: [
        'carne moida',
        'carne bovina magra',
        'patinho bovino',
        'ground beef',
        'lean ground beef',
        'beef',
        'patinho',
      ],
    });
  });
});
