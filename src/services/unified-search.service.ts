import { searchFoods } from '../fatsecret/search-client';
import { logger } from '../logger';
import { CatalogLanguage, isCatalogLanguage } from '../catalog/domain/catalog-language';
import { createSearchFoodCatalogService } from '../catalog/application/search-food-catalog.service';
import { RedisCatalogProviderRepository } from '../catalog/infrastructure/redis/redis-catalog-provider.repository';
import { PostgresBackedCatalogProviderRepository } from '../catalog/infrastructure/postgres/postgres-backed-catalog-provider.repository';
import { autoIngestCatalog as defaultAutoIngestCatalog } from '../catalog/application/auto-ingest-catalog.service';
import { createTranslator } from '../translation/create-translator';
import { RedisTranslationCacheRepository, TranslationCacheRepository } from '../translation/translation-cache-repository';
import { Translator } from '../translation/translator';
import { CatalogSearchRequest, CatalogSearchResponse } from '../catalog/domain/catalog-models';
import { FatSecretFoodItem } from '../fatsecret/response-mapper';

export interface UnifiedSearchDeps {
  catalogSearchService: (request: CatalogSearchRequest) => Promise<CatalogSearchResponse>;
  translator: Translator;
  cacheRepo: TranslationCacheRepository;
  searchFoodsClient: (query: string, maxResults: number, region: string, language: string) => Promise<FatSecretFoodItem[]>;
  autoIngestCatalogClient: (items: FatSecretFoodItem[], region: string) => Promise<void>;
}

function mapToCatalogLanguage(language: string): CatalogLanguage {
  const shortCode = language.substring(0, 2).toLowerCase();
  if (isCatalogLanguage(shortCode)) {
    return shortCode;
  }
  return 'en';
}

export function createUnifiedSearchFoodsService(deps: UnifiedSearchDeps) {
  return async function unifiedSearchFoods(
    query: string,
    maxResults: number,
    region: string,
    language: string,
    page: number = 1
  ) {
    const lang = mapToCatalogLanguage(language);

    // 1. Search Catalog
    const catalogResponse = await deps.catalogSearchService({
      lang,
      query,
      page,
      pageSize: maxResults,
      region,
    });

  if (catalogResponse.total > 0) {
    return {
      results: catalogResponse.results,
      meta: catalogResponse.meta,
      total: catalogResponse.total,
      page,
      pageSize: maxResults,
      source: 'catalog',
    };
  }

    // 2. Fallback to FatSecret
    let englishQuery = query;
    if (lang !== 'en') {
      const cachedQueryTranslation = await deps.cacheRepo.getQueryTranslation(language, 'en', query);
      if (cachedQueryTranslation) {
        englishQuery = cachedQueryTranslation;
      } else {
        try {
          englishQuery = await deps.translator.translateText(query, 'en', language);
          await deps.cacheRepo.setQueryTranslation(language, 'en', query, englishQuery);
        } catch (error) {
          logger.warn({ error, query, language }, 'Query translation failed; using original query for upstream');
        }
      }
    }

    const legacyResults = await deps.searchFoodsClient(englishQuery, maxResults, region, 'en');

    // 3. Auto-ingest in background (fire-and-forget)
    if (legacyResults.length > 0) {
      deps.autoIngestCatalogClient(legacyResults, region).catch((error) => {
        logger.error({ error }, 'Background auto-ingestion failed');
      });
    }

    // Translate results to target language synchronously for the immediate response
    let translatedResults = legacyResults;
    if (lang !== 'en' && legacyResults.length > 0) {
      try {
        const englishNames = legacyResults.map(r => r.name);
        const translatedNames = await deps.translator.translateTexts(englishNames, lang, 'en');
      translatedResults = legacyResults.map((result, i) => ({
        ...result,
        name: translatedNames[i] ?? result.name,
      }));
    } catch (error) {
      logger.warn({ error, lang }, 'Failed to translate FatSecret results for immediate response');
    }
  }

    return {
      results: translatedResults,
      meta: catalogResponse.meta,
      total: translatedResults.length,
      page,
      pageSize: maxResults,
      source: 'fatsecret',
    };
  };
}

export const unifiedSearchFoods = createUnifiedSearchFoodsService({
  catalogSearchService: createSearchFoodCatalogService({
    provider: new PostgresBackedCatalogProviderRepository(new RedisCatalogProviderRepository()),
    now: () => Date.now(),
  }),
  translator: createTranslator(),
  cacheRepo: new RedisTranslationCacheRepository(),
  searchFoodsClient: searchFoods,
  autoIngestCatalogClient: defaultAutoIngestCatalog,
});
