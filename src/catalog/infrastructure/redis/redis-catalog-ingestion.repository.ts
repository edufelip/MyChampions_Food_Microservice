import { getRedisClient } from '../../../cache/redis-client';
import { config } from '../../../config';
import { CatalogIngestionPort, LocalizationPort } from '../../domain/catalog-ports';
import {
  CatalogFoodLocalizationEntry,
  CatalogFoodUpsertDocument,
  LocalizationReviewStatus,
} from '../../domain/catalog-models';
import { CatalogLanguage } from '../../domain/catalog-language';
import {
  catalogActiveGenerationKey,
  catalogFoodDocumentKey,
  catalogFoodIndexKey,
  catalogFoodSynonymKey,
  catalogFoodLocalizationStatusKey,
  catalogFoodPopularityKey,
  catalogFoodStatsKey,
  catalogLanguageTokenSetKey,
} from './food-catalog-keys';
import { normalizeCatalogQuery } from '../../application/query-normalizer';

interface StoredCatalogFoodDocument {
  id: string;
  nutrition: {
    carbohydrate: number;
    protein: number;
    fat: number;
    serving: number;
  };
  localized: Record<string, CatalogFoodLocalizationEntry>;
  region?: string;
  source?: string;
}

function tokenizeName(value: string): string[] {
  return normalizeCatalogQuery(value)
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

function tokenPrefixes(token: string): string[] {
  const prefixes: string[] = [];
  for (let length = 2; length <= token.length; length += 1) {
    prefixes.push(token.slice(0, length));
  }
  return prefixes;
}

async function deleteByPattern(pattern: string): Promise<void> {
  const client = getRedisClient();
  if (!client) return;

  let cursor = '0';
  do {
    const [nextCursor, keys] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 400);
    cursor = nextCursor;
    if (keys.length > 0) {
      await client.unlink(...keys);
    }
  } while (cursor !== '0');
}

function buildTokenSynonyms(token: string): string[] {
  const synonyms = new Set<string>([token]);
  if (token.endsWith('s') && token.length > 3) {
    synonyms.add(token.slice(0, -1));
  } else if (token.length > 2) {
    synonyms.add(`${token}s`);
  }
  return Array.from(synonyms);
}

async function removeFoodFromLanguageIndexes(
  lang: CatalogLanguage,
  generation: string,
  foodId: string,
): Promise<void> {
  const client = getRedisClient();
  if (!client) return;

  let cursor = '0';
  do {
    const [nextCursor, keys] = await client.scan(
      cursor,
      'MATCH',
      `catalog:index:${config.catalogIndexVersion}:${generation}:${lang}:*`,
      'COUNT',
      400,
    );
    cursor = nextCursor;
    if (keys.length === 0) continue;
    const pipeline = client.pipeline();
    keys.forEach((key) => {
      pipeline.zrem(key, foodId);
    });
    await pipeline.exec();
  } while (cursor !== '0');
}

export class RedisCatalogIngestionRepository implements CatalogIngestionPort, LocalizationPort {
  async upsertFoods(items: CatalogFoodUpsertDocument[]): Promise<void> {
    const client = getRedisClient();
    if (!client || items.length === 0) return;

    const pipeline = client.pipeline();

    items.forEach((item) => {
      pipeline.set(
        catalogFoodDocumentKey(item.id),
        JSON.stringify({
          id: item.id,
          nutrition: item.nutrition,
          localized: item.localized,
          region: item.region,
          source: item.source,
        } satisfies StoredCatalogFoodDocument),
      );

      Object.entries(item.localized).forEach(([lang, localized]) => {
        pipeline.hset(
          catalogFoodLocalizationStatusKey(item.id, lang as CatalogLanguage),
          {
            status: localized.reviewStatus,
            updatedAt: localized.updatedAt,
          },
        );
      });
    });

    const result = await pipeline.exec();
    if (result?.some(([error]) => error)) {
      throw new Error('Failed to upsert catalog food documents');
    }

    await this.refreshStats();
  }

  async rebuildIndexes(langs: CatalogLanguage[]): Promise<void> {
    const client = getRedisClient();
    if (!client) return;

    const activeGeneration = await this.getActiveGeneration();
    const targetGeneration = activeGeneration === 'a' ? 'b' : 'a';

    await Promise.all([
      deleteByPattern(`catalog:index:${config.catalogIndexVersion}:${targetGeneration}:*`),
      deleteByPattern(`catalog:popularity:${config.catalogIndexVersion}:${targetGeneration}:*`),
      deleteByPattern(`catalog:syn:${config.catalogIndexVersion}:${targetGeneration}:*`),
      deleteByPattern(`catalog:tokens:${config.catalogIndexVersion}:${targetGeneration}:*`),
    ]);

    let cursor = '0';
    do {
      const [nextCursor, keys] = await client.scan(
        cursor,
        'MATCH',
        `catalog:food:*:${config.catalogIndexVersion}`,
        'COUNT',
        200,
      );
      cursor = nextCursor;
      if (keys.length === 0) continue;

      const rawDocuments = await client.mget(keys);
      const documents = rawDocuments
        .map((raw) => {
          if (!raw) return null;
          try {
            return JSON.parse(raw) as StoredCatalogFoodDocument;
          } catch {
            return null;
          }
        })
        .filter((doc): doc is StoredCatalogFoodDocument => doc !== null);

      const pipeline = client.pipeline();
      documents.forEach((doc) => {
        langs.forEach((lang) => {
          const localizedName = doc.localized?.[lang]?.name ?? doc.localized?.['en']?.name;
          if (!localizedName) return;
          const tokens = tokenizeName(localizedName);
          tokens.forEach((token) => {
            pipeline.sadd(catalogLanguageTokenSetKey(lang, targetGeneration), token);
            tokenPrefixes(token).forEach((prefix) => {
              pipeline.zadd(catalogFoodIndexKey(lang, prefix, targetGeneration), 1, doc.id);
            });
            buildTokenSynonyms(token).forEach((synonym) => {
              pipeline.sadd(catalogFoodSynonymKey(lang, synonym, targetGeneration), token);
            });
          });
          pipeline.zadd(catalogFoodPopularityKey(lang, doc.region ?? 'GLOBAL', targetGeneration), 0, doc.id);
        });
      });
      const result = await pipeline.exec();
      if (result?.some(([error]) => error)) {
        throw new Error('Failed to rebuild catalog indexes');
      }
    } while (cursor !== '0');

    await client.set(catalogActiveGenerationKey(), targetGeneration);
    await this.refreshStats();
  }

  async machineTranslateText(text: string, _targetLang: CatalogLanguage): Promise<string> {
    return text;
  }

  async markLocalizedStatus(params: {
    foodId: string;
    lang: CatalogLanguage;
    status: LocalizationReviewStatus;
    reviewerId?: string;
    localizedName?: string;
  }): Promise<void> {
    const client = getRedisClient();
    if (!client) return;

    const rawDocument = await client.get(catalogFoodDocumentKey(params.foodId));
    if (!rawDocument) {
      throw new Error(`Catalog food not found: ${params.foodId}`);
    }

    const document = JSON.parse(rawDocument) as StoredCatalogFoodDocument;
    const generation = await this.getActiveGeneration();
    const previousLocalizedName = document.localized?.[params.lang]?.name ?? document.localized?.['en']?.name;
    const nextLocalizedName = params.localizedName?.trim() || previousLocalizedName || '';
    if (!nextLocalizedName) {
      throw new Error(`Localized name missing for ${params.foodId} (${params.lang})`);
    }

    document.localized = {
      ...document.localized,
      [params.lang]: {
        name: nextLocalizedName,
        reviewStatus: params.status,
        updatedAt: new Date().toISOString(),
      },
    };

    await client.set(catalogFoodDocumentKey(params.foodId), JSON.stringify(document));

    await client.hset(
      catalogFoodLocalizationStatusKey(params.foodId, params.lang),
      {
        status: params.status,
        reviewerId: params.reviewerId ?? '',
        updatedAt: new Date().toISOString(),
      },
    );

    await removeFoodFromLanguageIndexes(params.lang, generation, params.foodId);
    const tokens = tokenizeName(nextLocalizedName);
    if (tokens.length > 0) {
      const pipeline = client.pipeline();
      tokens.forEach((token) => {
        pipeline.sadd(catalogLanguageTokenSetKey(params.lang, generation), token);
        tokenPrefixes(token).forEach((prefix) => {
          pipeline.zadd(catalogFoodIndexKey(params.lang, prefix, generation), 1, params.foodId);
        });
        buildTokenSynonyms(token).forEach((synonym) => {
          pipeline.sadd(catalogFoodSynonymKey(params.lang, synonym, generation), token);
        });
      });
      await pipeline.exec();
    }
  }

  private async refreshStats(): Promise<void> {
    const client = getRedisClient();
    if (!client) return;

    let cursor = '0';
    let count = 0;
    do {
      const [nextCursor, keys] = await client.scan(
        cursor,
        'MATCH',
        `catalog:food:*:${config.catalogIndexVersion}`,
        'COUNT',
        500,
      );
      cursor = nextCursor;
      count += keys.length;
    } while (cursor !== '0');

    await client.hset(catalogFoodStatsKey(), {
      documentCount: count,
      lastFreshnessAt: new Date().toISOString(),
    });
  }

  private async getActiveGeneration(): Promise<string> {
    const client = getRedisClient();
    if (!client) return 'a';
    const raw = await client.get(catalogActiveGenerationKey());
    return raw === 'b' ? 'b' : 'a';
  }
}
