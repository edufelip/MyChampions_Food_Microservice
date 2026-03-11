import {
  catalogActiveGenerationKey,
  catalogFoodDocumentKey,
  catalogFoodIndexKey,
  catalogFoodLocalizationStatusKey,
  catalogLanguageTokenSetKey,
  catalogFoodPopularityKey,
  catalogFoodStatsKey,
  catalogFoodSynonymKey,
} from '../../catalog/infrastructure/redis/food-catalog-keys';

describe('food-catalog-keys', () => {
  it('builds document and stats keys with version suffix', () => {
    expect(catalogFoodDocumentKey('123')).toBe('catalog:food:123:v1');
    expect(catalogFoodStatsKey()).toBe('catalog:stats:v1');
    expect(catalogActiveGenerationKey()).toBe('catalog:active-gen:v1');
  });

  it('normalizes token and synonym segments', () => {
    expect(catalogFoodIndexKey('pt', '  FrânGo  ', 'a')).toBe('catalog:index:v1:a:pt:frango');
    expect(catalogFoodSynonymKey('en', '  Chicken-Breast  ', 'b')).toBe('catalog:syn:v1:b:en:chicken-breast');
  });

  it('builds popularity and localization status keys', () => {
    expect(catalogFoodPopularityKey('es', 'mx', 'a')).toBe('catalog:popularity:v1:a:es:MX');
    expect(catalogLanguageTokenSetKey('it', 'b')).toBe('catalog:tokens:v1:b:it');
    expect(catalogFoodLocalizationStatusKey('999', 'fr')).toBe('catalog:l10n:status:999:fr');
  });
});
