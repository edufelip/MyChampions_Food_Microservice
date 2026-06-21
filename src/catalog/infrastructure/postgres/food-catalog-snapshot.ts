import { RedisSnapshotEntry, RedisZSetMember } from './redis-snapshot-types';

interface StoredFoodDocument {
  id: string;
  nutrition: {
    carbohydrate: number;
    protein: number;
    fat: number;
    serving: number;
  };
  localized?: Record<string, StoredFoodLocalization>;
  region?: string;
  source?: string;
}

interface StoredFoodLocalization {
  name?: string;
  reviewStatus?: string;
  updatedAt?: string;
}

export interface FoodCatalogFoodRow {
  id: string;
  carbohydrate: number;
  protein: number;
  fat: number;
  serving: number;
  region: string | null;
  source: string | null;
  rawDocument: StoredFoodDocument;
}

export interface FoodCatalogLocalizationRow {
  foodId: string;
  lang: string;
  name: string;
  reviewStatus: string;
  updatedAt: string | null;
  rawLocalization: StoredFoodLocalization;
}

export interface FoodCatalogLocalizationStatusRow {
  foodId: string;
  lang: string;
  status: string;
  reviewerId: string | null;
  updatedAt: string | null;
  rawStatus: Record<string, string>;
}

export interface FoodCatalogPopularityRow {
  indexVersion: string;
  generation: string;
  lang: string;
  region: string;
  foodId: string;
  score: number;
}

export interface FoodCatalogMetadataRow {
  key: string;
  data: Record<string, unknown>;
}

export interface FoodCatalogSnapshotRows {
  activeGeneration: string | null;
  foods: FoodCatalogFoodRow[];
  localizations: FoodCatalogLocalizationRow[];
  localizationStatuses: FoodCatalogLocalizationStatusRow[];
  popularity: FoodCatalogPopularityRow[];
  metadata: FoodCatalogMetadataRow[];
}

function parseJsonObject<T>(value: unknown): T | null {
  if (typeof value !== 'string') {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as T) : null;
  } catch {
    return null;
  }
}

function isHashValue(value: unknown): value is Record<string, string> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isZSetValue(value: unknown): value is RedisZSetMember[] {
  return Array.isArray(value)
    && value.every((item) => (
      !!item
      && typeof item === 'object'
      && 'member' in item
      && 'score' in item
      && typeof item.member === 'string'
      && typeof item.score === 'number'
    ));
}

function toNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function buildFoodRows(entry: RedisSnapshotEntry): {
  food: FoodCatalogFoodRow;
  localizations: FoodCatalogLocalizationRow[];
} | null {
  const doc = parseJsonObject<StoredFoodDocument>(entry.value);
  if (!doc?.id || !doc.nutrition) {
    return null;
  }

  const localizations = Object.entries(doc.localized ?? {})
    .filter(([, localization]) => typeof localization.name === 'string' && localization.name.length > 0)
    .map(([lang, localization]) => ({
      foodId: doc.id,
      lang,
      name: localization.name as string,
      reviewStatus: localization.reviewStatus ?? 'machine',
      updatedAt: localization.updatedAt ?? null,
      rawLocalization: localization,
    }));

  return {
    food: {
      id: doc.id,
      carbohydrate: toNumber(doc.nutrition.carbohydrate),
      protein: toNumber(doc.nutrition.protein),
      fat: toNumber(doc.nutrition.fat),
      serving: toNumber(doc.nutrition.serving),
      region: doc.region ?? null,
      source: doc.source ?? null,
      rawDocument: doc,
    },
    localizations,
  };
}

export function buildFoodCatalogSnapshotRows(entries: RedisSnapshotEntry[]): FoodCatalogSnapshotRows {
  const rows: FoodCatalogSnapshotRows = {
    activeGeneration: null,
    foods: [],
    localizations: [],
    localizationStatuses: [],
    popularity: [],
    metadata: [],
  };

  entries.forEach((entry) => {
    const parts = entry.key.split(':');

    if (parts[0] !== 'catalog') {
      return;
    }

    if (parts[1] === 'active-gen' && typeof entry.value === 'string') {
      rows.activeGeneration = entry.value;
      return;
    }

    if (parts[1] === 'stats' && isHashValue(entry.value)) {
      rows.metadata.push({ key: 'stats', data: entry.value });
      return;
    }

    if (parts[1] === 'food') {
      const foodRows = buildFoodRows(entry);
      if (foodRows) {
        rows.foods.push(foodRows.food);
        rows.localizations.push(...foodRows.localizations);
      }
      return;
    }

    if (parts[1] === 'l10n' && parts[2] === 'status' && parts.length >= 5 && isHashValue(entry.value)) {
      rows.localizationStatuses.push({
        foodId: parts[3] as string,
        lang: parts[4] as string,
        status: entry.value.status ?? '',
        reviewerId: entry.value.reviewerId || null,
        updatedAt: entry.value.updatedAt || null,
        rawStatus: entry.value,
      });
      return;
    }

    if (parts[1] === 'popularity' && parts.length >= 6 && isZSetValue(entry.value)) {
      const indexVersion = parts[2] as string;
      const generation = parts[3] as string;
      const lang = parts[4] as string;
      const region = parts.slice(5).join(':') || 'GLOBAL';
      rows.popularity.push(...entry.value.map((item) => ({
        indexVersion,
        generation,
        lang,
        region,
        foodId: item.member,
        score: item.score,
      })));
    }
  });

  return rows;
}
