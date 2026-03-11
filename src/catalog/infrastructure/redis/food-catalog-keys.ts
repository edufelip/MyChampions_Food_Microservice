import { config } from '../../../config';
import { CatalogLanguage } from '../../domain/catalog-language';

function sanitizeToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function catalogFoodDocumentKey(foodId: string): string {
  return `catalog:food:${foodId}:${config.catalogIndexVersion}`;
}

export function catalogActiveGenerationKey(): string {
  return `catalog:active-gen:${config.catalogIndexVersion}`;
}

export function catalogFoodIndexKey(
  lang: CatalogLanguage,
  tokenPrefix: string,
  generation: string,
): string {
  return `catalog:index:${config.catalogIndexVersion}:${generation}:${lang}:${sanitizeToken(tokenPrefix)}`;
}

export function catalogFoodSynonymKey(
  lang: CatalogLanguage,
  normalizedTerm: string,
  generation: string,
): string {
  return `catalog:syn:${config.catalogIndexVersion}:${generation}:${lang}:${sanitizeToken(normalizedTerm)}`;
}

export function catalogFoodPopularityKey(
  lang: CatalogLanguage,
  region: string,
  generation: string,
): string {
  return `catalog:popularity:${config.catalogIndexVersion}:${generation}:${lang}:${region.trim().toUpperCase() || 'GLOBAL'}`;
}

export function catalogLanguageTokenSetKey(lang: CatalogLanguage, generation: string): string {
  return `catalog:tokens:${config.catalogIndexVersion}:${generation}:${lang}`;
}

export function catalogFoodLocalizationStatusKey(foodId: string, lang: CatalogLanguage): string {
  return `catalog:l10n:status:${foodId}:${lang}`;
}

export function catalogFoodStatsKey(): string {
  return `catalog:stats:${config.catalogIndexVersion}`;
}
