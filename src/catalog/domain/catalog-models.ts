import { CatalogLanguage } from './catalog-language';

export interface CatalogFoodItem {
  id: string;
  name: string;
  carbohydrate: number;
  protein: number;
  fat: number;
  serving: number;
  region?: string;
  source?: string;
}

export type LocalizationReviewStatus = 'machine' | 'reviewed' | 'rejected';

export interface CatalogFoodLocalizationEntry {
  name: string;
  reviewStatus: LocalizationReviewStatus;
  updatedAt: string;
}

export interface CatalogFoodUpsertDocument {
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

export interface CatalogSearchRequest {
  lang: CatalogLanguage;
  query: string;
  page: number;
  pageSize: number;
  region?: string;
}

export interface CatalogSearchResponse {
  page: number;
  pageSize: number;
  total: number;
  results: CatalogFoodItem[];
  meta: {
    lang: CatalogLanguage;
    normalizedQuery: string;
    rewriteApplied?: boolean;
    rewrittenFrom?: string;
    tookMs: number;
  };
}

export interface CatalogHealthSnapshot {
  enabled: boolean;
  ready: boolean;
  indexVersion: string;
  documentCount: number;
  lastFreshnessAt: string | null;
  stale?: boolean;
  maxAgeDays?: number;
  freshnessAgeDays?: number | null;
}
