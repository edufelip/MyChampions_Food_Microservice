import { FatSecretFoodItem } from '../../fatsecret/response-mapper';
import {
  createLocalizedFoodSearchService,
} from '../../services/search-foods-localized.service';
import { TranslationCacheRepository } from '../../translation/translation-cache-repository';
import { Translator } from '../../translation/google-translate-client';
import { getCounter, resetCounters } from '../../metrics';

describe('searchFoodsLocalized service', () => {
  const foodsInEnglish: FatSecretFoodItem[] = [
    { id: '100', name: 'Chicken Breast', carbohydrate: 0, protein: 31, fat: 3.6, serving: 100 },
    { id: '101', name: 'Rice', carbohydrate: 28, protein: 2.7, fat: 0.3, serving: 100 },
  ];

  function createDeps() {
    const translator: jest.Mocked<Translator> = {
      detectLanguage: jest.fn(),
      translateText: jest.fn(),
      translateTexts: jest.fn(),
    };

    const cacheRepository: jest.Mocked<TranslationCacheRepository> = {
      getFoodTranslation: jest.fn(),
      setFoodTranslation: jest.fn(),
      getQueryTranslation: jest.fn(),
      setQueryTranslation: jest.fn(),
    };

    const searchClient = jest.fn().mockResolvedValue(foodsInEnglish);

    return { translator, cacheRepository, searchClient };
  }

  beforeEach(() => {
    resetCounters();
  });

  it('translates non-English query to English and localizes names using payload language', async () => {
    const { translator, cacheRepository, searchClient } = createDeps();
    translator.detectLanguage.mockResolvedValue('es');
    cacheRepository.getQueryTranslation.mockResolvedValue(null);
    translator.translateText.mockResolvedValue('chicken');
    cacheRepository.getFoodTranslation.mockResolvedValue(null);
    translator.translateTexts.mockResolvedValue(['Peito de Frango', 'Arroz']);

    const service = createLocalizedFoodSearchService({ translator, cacheRepository, searchClient });

    const result = await service('pollo', 10, 'US', 'pt-BR');

    expect(cacheRepository.getQueryTranslation).toHaveBeenCalledWith('pt-BR', 'en', 'pollo');
    expect(translator.translateText).toHaveBeenCalledWith('pollo', 'en', 'pt-BR');
    expect(searchClient).toHaveBeenCalledWith('chicken', 10, 'US', 'en');
    expect(result[0]?.name).toBe('Peito de Frango');
    expect(result[1]?.name).toBe('Arroz');
    expect(cacheRepository.setFoodTranslation).toHaveBeenCalledWith('100', 'pt-BR', 'Peito de Frango');
  });

  it('uses cached query translation and skips upstream query translation call', async () => {
    const { translator, cacheRepository, searchClient } = createDeps();
    translator.detectLanguage.mockResolvedValue('pt');
    cacheRepository.getQueryTranslation.mockResolvedValue('beans');
    cacheRepository.getFoodTranslation.mockResolvedValue(null);
    translator.translateTexts.mockResolvedValue(['Feijao', 'Arroz']);

    const service = createLocalizedFoodSearchService({ translator, cacheRepository, searchClient });

    await service('feijao', 5, 'BR', 'pt-BR');

    expect(translator.translateText).not.toHaveBeenCalled();
    expect(cacheRepository.getQueryTranslation).toHaveBeenCalledWith('pt-BR', 'en', 'feijao');
    expect(searchClient).toHaveBeenCalledWith('beans', 5, 'BR', 'en');
  });

  it('returns cached translated names without calling translation API for names', async () => {
    const { translator, cacheRepository, searchClient } = createDeps();
    translator.detectLanguage.mockResolvedValue('en');
    cacheRepository.getFoodTranslation
      .mockResolvedValueOnce('Peito de Frango')
      .mockResolvedValueOnce('Arroz');

    const service = createLocalizedFoodSearchService({ translator, cacheRepository, searchClient });

    const result = await service('chicken', 5, 'US', 'pt-BR');

    expect(translator.translateTexts).not.toHaveBeenCalled();
    expect(result).toEqual([
      { ...foodsInEnglish[0], name: 'Peito de Frango' },
      { ...foodsInEnglish[1], name: 'Arroz' },
    ]);
  });

  it('increments translation/cache counters for visibility', async () => {
    const { translator, cacheRepository, searchClient } = createDeps();
    translator.detectLanguage.mockResolvedValue('pt-BR');
    cacheRepository.getQueryTranslation.mockResolvedValue('chicken');
    cacheRepository.getFoodTranslation
      .mockResolvedValueOnce('Peito de Frango')
      .mockResolvedValueOnce(null);
    translator.translateTexts.mockResolvedValue(['Arroz']);

    const service = createLocalizedFoodSearchService({ translator, cacheRepository, searchClient });

    await service('frango', 5, 'BR', 'pt-BR');

    expect(getCounter('translation.query_cache_hit')).toBe(1);
    expect(getCounter('translation.food_cache_hit')).toBe(1);
    expect(getCounter('translation.food_cache_miss')).toBe(1);
    expect(getCounter('translation.food_translate_success')).toBe(1);
  });
});
