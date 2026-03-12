import { rewriteCatalogQuery } from '../../catalog/application/query-rewrite';

describe('query-rewrite', () => {
  it('rewrites patinho to lean ground beef for pt', () => {
    expect(rewriteCatalogQuery('pt', 'Patinho')).toEqual({
      normalizedQuery: 'lean ground beef',
      rewrittenFrom: 'patinho',
    });
  });

  it('normalizes and rewrites carne moída to ground beef for pt', () => {
    expect(rewriteCatalogQuery('pt', 'Carne Moída')).toEqual({
      normalizedQuery: 'ground beef',
      rewrittenFrom: 'carne moida',
    });
  });

  it('does not rewrite non-pt queries', () => {
    expect(rewriteCatalogQuery('en', 'patinho')).toEqual({
      normalizedQuery: 'patinho',
    });
  });
});
