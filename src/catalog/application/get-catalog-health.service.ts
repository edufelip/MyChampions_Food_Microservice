import { CatalogProviderPort } from '../domain/catalog-ports';
import { CatalogHealthSnapshot } from '../domain/catalog-models';

export function createCatalogHealthService(
  provider: CatalogProviderPort,
): () => Promise<CatalogHealthSnapshot> {
  return async (): Promise<CatalogHealthSnapshot> => provider.getHealth();
}
