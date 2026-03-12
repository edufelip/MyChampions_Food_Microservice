import {
  CatalogSyncError,
  createSyncFoodCatalogService,
} from '../../catalog/application/sync-food-catalog.service';
import { CatalogFoodUpsertDocument } from '../../catalog/domain/catalog-models';

describe('sync-food-catalog.service', () => {
  it('fetches, localizes, and upserts deduplicated catalog documents', async () => {
    const searchClient = jest
      .fn()
      .mockResolvedValueOnce([
        { id: '1', name: 'Chicken Breast', carbohydrate: 0, protein: 31, fat: 3.6, serving: 100 },
        { id: '2', name: 'Rice', carbohydrate: 28, protein: 2.7, fat: 0.3, serving: 100 },
      ])
      .mockResolvedValueOnce([
        { id: '2', name: 'Rice', carbohydrate: 28, protein: 2.7, fat: 0.3, serving: 100 },
      ]);

    const translator = {
      detectLanguage: jest.fn(),
      translateText: jest.fn(),
      translateTexts: jest.fn().mockImplementation(async (texts: string[], target: string) => {
        if (target === 'pt') return texts.map((name) => `pt:${name}`);
        if (target === 'es') return texts.map((name) => `es:${name}`);
        if (target === 'fr') return texts.map((name) => `fr:${name}`);
        if (target === 'it') return texts.map((name) => `it:${name}`);
        return texts;
      }),
    };

    const upsertFoods = jest.fn();
    const rebuildIndexes = jest.fn();
    const service = createSyncFoodCatalogService({
      searchClient,
      translator,
      ingestion: { upsertFoods, rebuildIndexes },
      nowIso: () => '2026-03-11T00:00:00.000Z',
    });

    const result = await service({
      seedQueries: ['chicken', 'rice'],
      region: 'US',
      maxResultsPerQuery: 10,
    });

    expect(result).toMatchObject({
      seedQueries: ['chicken', 'rice'],
      region: 'US',
      maxResultsPerQuery: 10,
      fetchedItems: 3,
      upsertedDocuments: 2,
    });

    expect(searchClient).toHaveBeenCalledTimes(2);
    expect(upsertFoods).toHaveBeenCalledTimes(1);
    expect(rebuildIndexes).toHaveBeenCalledTimes(1);

    const [documents] = upsertFoods.mock.calls[0] as [CatalogFoodUpsertDocument[]];
    expect(documents).toHaveLength(2);
    expect(documents[0]?.localized['en']?.name).toBe('Chicken Breast');
    expect(documents[0]?.localized['pt']?.name).toBe('pt:Chicken Breast');
    expect(documents[0]?.localized['pt']?.reviewStatus).toBe('machine');
  });

  it('fails sync when Portuguese translation fails in strict mode', async () => {
    const searchClient = jest.fn().mockResolvedValue([
      { id: '1', name: 'Potato', carbohydrate: 17, protein: 2, fat: 0.1, serving: 100 },
    ]);

    const translator = {
      detectLanguage: jest.fn(),
      translateText: jest.fn(),
      translateTexts: jest.fn().mockImplementation(async (texts: string[], target: string) => {
        if (target === 'pt') {
          throw new Error('translate unavailable');
        }
        return texts.map((name) => `${target}:${name}`);
      }),
    };

    const upsertFoods = jest.fn();
    const rebuildIndexes = jest.fn();
    const service = createSyncFoodCatalogService({
      searchClient,
      translator,
      ingestion: { upsertFoods, rebuildIndexes },
      nowIso: () => '2026-03-11T00:00:00.000Z',
    });

    let thrown: unknown = null;
    try {
      await service({
        seedQueries: ['potato'],
        region: 'BR',
        maxResultsPerQuery: 10,
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(CatalogSyncError);
    expect(thrown).toMatchObject({
      code: 'catalog_translation_failed_pt',
    });
    expect(upsertFoods).not.toHaveBeenCalled();
    expect(rebuildIndexes).not.toHaveBeenCalled();
  });

  it('falls back to English for non-pt localization failures', async () => {
    const searchClient = jest.fn().mockResolvedValue([
      { id: '1', name: 'Potato', carbohydrate: 17, protein: 2, fat: 0.1, serving: 100 },
    ]);

    const translator = {
      detectLanguage: jest.fn(),
      translateText: jest.fn(),
      translateTexts: jest.fn().mockImplementation(async (texts: string[], target: string) => {
        if (target === 'es') {
          throw new Error('translate unavailable');
        }
        return texts.map((name) => `${target}:${name}`);
      }),
    };

    const upsertFoods = jest.fn();
    const rebuildIndexes = jest.fn();
    const service = createSyncFoodCatalogService({
      searchClient,
      translator,
      ingestion: { upsertFoods, rebuildIndexes },
      nowIso: () => '2026-03-11T00:00:00.000Z',
    });

    await service({
      seedQueries: ['potato'],
      region: 'BR',
      maxResultsPerQuery: 10,
    });

    const [documents] = upsertFoods.mock.calls[0] as [CatalogFoodUpsertDocument[]];
    expect(documents[0]?.localized['es']?.name).toBe('Potato');
    expect(documents[0]?.localized['pt']?.name).toBe('pt:Potato');
    expect(rebuildIndexes).toHaveBeenCalledTimes(1);
  });
});
