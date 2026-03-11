import { searchFoods } from '../fatsecret/search-client';
import { logger } from '../logger';
import { FatSecretFoodItem } from '../fatsecret/response-mapper';
import { isEnglishLanguage, normalizeLanguageCode } from '../translation/language';
import { GoogleTranslateClient, Translator } from '../translation/google-translate-client';
import {
  RedisTranslationCacheRepository,
  TranslationCacheRepository,
} from '../translation/translation-cache-repository';
import { incrementCounter } from '../metrics';

let loggedMissingApiKey = false;

interface LocalizedSearchDeps {
  translator: Translator;
  cacheRepository: TranslationCacheRepository;
  searchClient: typeof searchFoods;
}

type LocalizedSearchFn = (
  query: string,
  maxResults: number,
  region: string,
  payloadLanguage: string,
) => Promise<FatSecretFoodItem[]>;

function dedupeNames(items: Array<{ name: string; index: number }>): { uniqueNames: string[]; nameToIndexes: Map<string, number[]> } {
  const uniqueNames: string[] = [];
  const nameToIndexes = new Map<string, number[]>();

  items.forEach((item) => {
    const existingIndexes = nameToIndexes.get(item.name);
    if (!existingIndexes) {
      nameToIndexes.set(item.name, [item.index]);
      uniqueNames.push(item.name);
      return;
    }
    existingIndexes.push(item.index);
  });

  return { uniqueNames, nameToIndexes };
}

export function createLocalizedFoodSearchService(deps: LocalizedSearchDeps): LocalizedSearchFn {
  return async (
    query: string,
    maxResults: number,
    region: string,
    payloadLanguage: string,
  ): Promise<FatSecretFoodItem[]> => {
    const normalizedTargetLanguage = normalizeLanguageCode(payloadLanguage);

    const detectedLanguageRaw = await deps.translator.detectLanguage(query).catch((error: unknown) => {
      if (
        error instanceof Error &&
        error.message.includes('Missing required environment variable: GOOGLE_TRANSLATE_API_KEY')
      ) {
        if (!loggedMissingApiKey) {
          logger.error('Translation pipeline misconfigured: GOOGLE_TRANSLATE_API_KEY is missing');
          loggedMissingApiKey = true;
        }
      } else {
        logger.warn({ error }, 'Language detection failed; fallback to payload language');
      }
      return null;
    });
    const detectedLanguage = normalizeLanguageCode(detectedLanguageRaw ?? payloadLanguage);

    if (detectedLanguage !== normalizedTargetLanguage) {
      logger.info(
        { detectedLanguage, payloadLanguage: normalizedTargetLanguage },
        'Detected language differs from payload language; payload language will be used for response localization',
      );
    }

    let englishQuery = query;
    if (!isEnglishLanguage(normalizedTargetLanguage)) {
      const cachedEnglishQuery = await deps.cacheRepository.getQueryTranslation(
        normalizedTargetLanguage,
        'en',
        query,
      );

      if (cachedEnglishQuery) {
        incrementCounter('translation.query_cache_hit');
        englishQuery = cachedEnglishQuery;
      } else {
        incrementCounter('translation.query_cache_miss');
        try {
          englishQuery = await deps.translator.translateText(query, 'en', normalizedTargetLanguage);
          incrementCounter('translation.query_translate_success');
          await deps.cacheRepository.setQueryTranslation(normalizedTargetLanguage, 'en', query, englishQuery);
        } catch (error) {
          incrementCounter('translation.query_translate_failure');
          incrementCounter('translation.query_fallback_original');
          if (
            error instanceof Error &&
            error.message.includes('Missing required environment variable: GOOGLE_TRANSLATE_API_KEY')
          ) {
            if (!loggedMissingApiKey) {
              logger.error('Translation pipeline misconfigured: GOOGLE_TRANSLATE_API_KEY is missing');
              loggedMissingApiKey = true;
            }
          } else {
            logger.warn({ error }, 'Failed to translate query to English; using original query');
          }
        }
      }
    }

    const foods = await deps.searchClient(englishQuery, maxResults, region, 'en');

    if (foods.length === 0 || isEnglishLanguage(normalizedTargetLanguage)) {
      return foods;
    }

    const localizedFoods = foods.map((food) => ({ ...food }));
    const cachedTranslations = await Promise.all(
      localizedFoods.map((food) => deps.cacheRepository.getFoodTranslation(food.id, normalizedTargetLanguage)),
    );

    const missingNameEntries: Array<{ name: string; index: number; foodId: string }> = [];
    cachedTranslations.forEach((cachedName, index) => {
      if (cachedName) {
        incrementCounter('translation.food_cache_hit');
        const localizedFood = localizedFoods[index];
        if (localizedFood) {
          localizedFoods[index] = { ...localizedFood, name: cachedName };
        }
      } else {
        incrementCounter('translation.food_cache_miss');
        const localizedFood = localizedFoods[index];
        if (localizedFood) {
          missingNameEntries.push({
            name: localizedFood.name,
            index,
            foodId: localizedFood.id,
          });
        }
      }
    });

    if (missingNameEntries.length === 0) {
      return localizedFoods;
    }

    const { uniqueNames, nameToIndexes } = dedupeNames(missingNameEntries);

    let translatedNames: string[];
    try {
      translatedNames = await deps.translator.translateTexts(uniqueNames, normalizedTargetLanguage, 'en');
      incrementCounter('translation.food_translate_success');
    } catch (error) {
      incrementCounter('translation.food_translate_failure');
      incrementCounter('translation.food_fallback_english');
      logger.warn({ error }, 'Failed to translate food names; returning English names');
      return localizedFoods;
    }

    const translatedByName = new Map<string, string>();
    uniqueNames.forEach((name, index) => {
      translatedByName.set(name, translatedNames[index] ?? name);
    });

    const persistPromises: Array<Promise<void>> = [];
    missingNameEntries.forEach((entry) => {
      const translatedName = translatedByName.get(entry.name) ?? entry.name;
      const targetIndexes = nameToIndexes.get(entry.name) ?? [entry.index];

      targetIndexes.forEach((targetIndex) => {
        const localizedFood = localizedFoods[targetIndex];
        if (localizedFood) {
          localizedFoods[targetIndex] = { ...localizedFood, name: translatedName };
        }
      });

      persistPromises.push(
        deps.cacheRepository.setFoodTranslation(entry.foodId, normalizedTargetLanguage, translatedName),
      );
    });

    await Promise.all(persistPromises);
    return localizedFoods;
  };
}

const defaultService = createLocalizedFoodSearchService({
  translator: new GoogleTranslateClient(),
  cacheRepository: new RedisTranslationCacheRepository(),
  searchClient: searchFoods,
});

export const searchFoodsLocalized = defaultService;
