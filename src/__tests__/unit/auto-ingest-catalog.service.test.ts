import { createAutoIngestCatalogService } from '../../../src/catalog/application/auto-ingest-catalog.service';
import { Translator } from '../../../src/translation/translator';
import { CatalogIngestionPort } from '../../../src/catalog/domain/catalog-ports';

describe('autoIngestCatalog', () => {
  it('translates and upserts items', async () => {
    const mockTranslateTexts = jest.fn().mockResolvedValue(['food 1 translated', 'food 2 translated']);
    const mockUpsertFoods = jest.fn().mockResolvedValue(undefined);
    const mockAppendToIndexes = jest.fn().mockResolvedValue(undefined);

    const deps = {
      translator: { translateTexts: mockTranslateTexts } as unknown as Translator,
      ingestion: { upsertFoods: mockUpsertFoods, appendToIndexes: mockAppendToIndexes } as unknown as CatalogIngestionPort,
      nowIso: () => '2026-06-07T00:00:00.000Z',
    };

    const service = createAutoIngestCatalogService(deps);

    const legacyResults = [
      { id: '1', name: 'food 1', carbohydrate: 1, protein: 2, fat: 3, serving: 100 },
      { id: '2', name: 'food 2', carbohydrate: 4, protein: 5, fat: 6, serving: 100 },
    ];

    await service(legacyResults, 'US');

    expect(mockTranslateTexts).toHaveBeenCalledTimes(4);
    expect(mockUpsertFoods).toHaveBeenCalledTimes(1);
    expect(mockAppendToIndexes).toHaveBeenCalledTimes(1);
  });
});
