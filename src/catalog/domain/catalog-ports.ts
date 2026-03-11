import { CatalogFoodItem, CatalogFoodUpsertDocument, CatalogHealthSnapshot } from './catalog-models';
import { CatalogLanguage } from './catalog-language';

export interface CatalogProviderPort {
  searchByPrefix(params: {
    lang: CatalogLanguage;
    normalizedQuery: string;
    page: number;
    pageSize: number;
    region?: string;
  }): Promise<{ total: number; items: CatalogFoodItem[] }>;
  getPopular(params: {
    lang: CatalogLanguage;
    page: number;
    pageSize: number;
    region?: string;
  }): Promise<{ total: number; items: CatalogFoodItem[] }>;
  getHealth(): Promise<CatalogHealthSnapshot>;
  recordServed(params: {
    lang: CatalogLanguage;
    region?: string;
    foodIds: string[];
  }): Promise<void>;
  recordClicked(params: {
    lang: CatalogLanguage;
    region?: string;
    foodId: string;
  }): Promise<void>;
}

export interface CatalogIngestionPort {
  upsertFoods(items: CatalogFoodUpsertDocument[]): Promise<void>;
  rebuildIndexes(langs: CatalogLanguage[]): Promise<void>;
}

export interface LocalizationPort {
  machineTranslateText(text: string, targetLang: CatalogLanguage): Promise<string>;
  markLocalizedStatus(params: {
    foodId: string;
    lang: CatalogLanguage;
    status: 'machine' | 'reviewed' | 'rejected';
    reviewerId?: string;
    localizedName?: string;
  }): Promise<void>;
}
