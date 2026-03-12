import { config } from '../../config';
import { searchFoods } from '../../fatsecret/search-client';
import { FatSecretFoodItem } from '../../fatsecret/response-mapper';
import { logger } from '../../logger';
import { GoogleTranslateClient, Translator } from '../../translation/google-translate-client';
import { CATALOG_LANGUAGES, CatalogLanguage } from '../domain/catalog-language';
import { CatalogIngestionPort } from '../domain/catalog-ports';
import { CatalogFoodUpsertDocument } from '../domain/catalog-models';
import { RedisCatalogIngestionRepository } from '../infrastructure/redis/redis-catalog-ingestion.repository';

interface SyncFoodCatalogDeps {
  searchClient: typeof searchFoods;
  translator: Translator;
  ingestion: CatalogIngestionPort;
  nowIso: () => string;
}

const TRANSLATION_BATCH_SIZE = 100;

export class CatalogSyncError extends Error {
  constructor(public readonly code: string, message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'CatalogSyncError';
  }
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function mapWithConcurrency<TInput, TOutput>(
  items: TInput[],
  concurrency: number,
  mapper: (item: TInput, index: number) => Promise<TOutput>,
): Promise<TOutput[]> {
  if (items.length === 0) return [];
  const effectiveConcurrency = Math.max(1, Math.min(concurrency, items.length));
  const results: TOutput[] = new Array(items.length);
  let nextIndex = 0;

  const workers = Array.from({ length: effectiveConcurrency }, async () => {
    while (true) {
      const current = nextIndex;
      nextIndex += 1;
      if (current >= items.length) return;
      results[current] = await mapper(items[current] as TInput, current);
    }
  });

  await Promise.all(workers);
  return results;
}

export interface CatalogSyncRequest {
  seedQueries?: string[];
  region?: string;
  maxResultsPerQuery?: number;
}

export interface CatalogSyncResult {
  seedQueries: string[];
  region: string;
  maxResultsPerQuery: number;
  fetchedItems: number;
  upsertedDocuments: number;
}

function uniqueById(items: FatSecretFoodItem[]): FatSecretFoodItem[] {
  const byId = new Map<string, FatSecretFoodItem>();
  items.forEach((item) => byId.set(item.id, item));
  return Array.from(byId.values());
}

async function buildLocalizedNames(
  translator: Translator,
  englishNames: string[],
  lang: CatalogLanguage,
): Promise<Map<string, string>> {
  if (lang === 'en') {
    return new Map(englishNames.map((name) => [name, name]));
  }

  try {
    const translatedChunks: string[] = [];
    const chunks = chunkArray(englishNames, TRANSLATION_BATCH_SIZE);
    for (const chunk of chunks) {
      const translated = await translator.translateTexts(chunk, lang, 'en');
      translatedChunks.push(...translated);
    }

    const map = new Map<string, string>();
    englishNames.forEach((name, index) => {
      map.set(name, translatedChunks[index] ?? name);
    });
    return map;
  } catch (error) {
    if (lang === 'pt' && config.strictPtLocalization) {
      throw new CatalogSyncError(
        'catalog_translation_failed_pt',
        'Portuguese localization failed during catalog sync',
        error,
      );
    }
    logger.warn({ error, lang }, 'Catalog translation failed; falling back to English names');
    return new Map(englishNames.map((name) => [name, name]));
  }
}

export function createSyncFoodCatalogService(deps: SyncFoodCatalogDeps): (request?: CatalogSyncRequest) => Promise<CatalogSyncResult> {
  return async (request?: CatalogSyncRequest): Promise<CatalogSyncResult> => {
    const seedQueries = request?.seedQueries?.filter((query) => query.trim().length > 0) ?? config.catalogSyncSeedQueries;
    const region = request?.region?.trim() || config.catalogSyncRegion;
    const maxResultsPerQuery = Math.max(
      1,
      Math.min(request?.maxResultsPerQuery ?? config.catalogSyncMaxResultsPerQuery, config.maxResultsLimit),
    );

    const fetchedByQuery = await mapWithConcurrency(
      seedQueries,
      config.catalogSyncConcurrency,
      async (query) => deps.searchClient(query, maxResultsPerQuery, region, 'en'),
    );
    const fetchedItems = fetchedByQuery.flat();
    const uniqueItems = uniqueById(fetchedItems);
    const englishNames = Array.from(new Set(uniqueItems.map((item) => item.name)));

    const localizedByLangEntries = await Promise.all(
      CATALOG_LANGUAGES.map(async (lang) => {
        const translations = await buildLocalizedNames(deps.translator, englishNames, lang);
        return [lang, translations] as const;
      }),
    );
    const localizedByLang = new Map<CatalogLanguage, Map<string, string>>(localizedByLangEntries);

    const now = deps.nowIso();
    const documents: CatalogFoodUpsertDocument[] = uniqueItems.map((item) => {
      const localized = Object.fromEntries(
        CATALOG_LANGUAGES.map((lang) => {
          const name = localizedByLang.get(lang)?.get(item.name) ?? item.name;
          return [
            lang,
            {
              name,
              reviewStatus: 'machine' as const,
              updatedAt: now,
            },
          ];
        }),
      );

      return {
        id: item.id,
        nutrition: {
          carbohydrate: item.carbohydrate,
          protein: item.protein,
          fat: item.fat,
          serving: item.serving,
        },
        localized,
        region,
        source: 'fatsecret',
      };
    });

    await deps.ingestion.upsertFoods(documents);
    await deps.ingestion.rebuildIndexes([...CATALOG_LANGUAGES]);

    return {
      seedQueries,
      region,
      maxResultsPerQuery,
      fetchedItems: fetchedItems.length,
      upsertedDocuments: documents.length,
    };
  };
}

const defaultSyncService = createSyncFoodCatalogService({
  searchClient: searchFoods,
  translator: new GoogleTranslateClient(),
  ingestion: new RedisCatalogIngestionRepository(),
  nowIso: () => new Date().toISOString(),
});

export const syncFoodCatalog = defaultSyncService;
