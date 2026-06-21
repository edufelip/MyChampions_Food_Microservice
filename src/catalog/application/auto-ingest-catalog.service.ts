import { config } from '../../config';
import { FatSecretFoodItem } from '../../fatsecret/response-mapper';
import { logger } from '../../logger';
import { createTranslator } from '../../translation/create-translator';
import { Translator } from '../../translation/translator';
import { CATALOG_LANGUAGES, CatalogLanguage } from '../domain/catalog-language';
import { CatalogIngestionPort } from '../domain/catalog-ports';
import { CatalogFoodUpsertDocument } from '../domain/catalog-models';
import { RedisCatalogIngestionRepository } from '../infrastructure/redis/redis-catalog-ingestion.repository';
import { CatalogSyncError } from './sync-food-catalog.service';

interface AutoIngestCatalogDeps {
  translator: Translator;
  ingestion: CatalogIngestionPort;
  nowIso: () => string;
}

const TRANSLATION_BATCH_SIZE = 100;

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
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
        'Portuguese localization failed during auto-ingest',
        error,
      );
    }
    logger.warn({ error, lang }, 'Auto-ingest translation failed; falling back to English names');
    return new Map(englishNames.map((name) => [name, name]));
  }
}

export function createAutoIngestCatalogService(deps: AutoIngestCatalogDeps): (items: FatSecretFoodItem[], region: string) => Promise<void> {
  return async (items: FatSecretFoodItem[], region: string): Promise<void> => {
    if (items.length === 0) return;

    const uniqueItems = Array.from(new Map(items.map((item) => [item.id, item])).values());
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

    try {
      await deps.ingestion.upsertFoods(documents);
      await deps.ingestion.appendToIndexes(documents, [...CATALOG_LANGUAGES]);
    } catch (error) {
      logger.error({ error }, 'Failed to upsert and append auto-ingested foods to catalog');
    }
  };
}

const defaultAutoIngestService = createAutoIngestCatalogService({
  translator: createTranslator(),
  ingestion: new RedisCatalogIngestionRepository(),
  nowIso: () => new Date().toISOString(),
});

export const autoIngestCatalog = defaultAutoIngestService;
