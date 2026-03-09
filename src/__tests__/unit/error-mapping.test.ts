/**
 * Unit tests – FatSecret response mapper and upstream error mapping.
 */
import { mapFatSecretResponse } from '../../fatsecret/response-mapper';
import { FatSecretError } from '../../fatsecret/search-client';

describe('mapFatSecretResponse', () => {
  it('returns empty array for null input', () => {
    expect(mapFatSecretResponse(null)).toEqual([]);
  });

  it('returns empty array for non-object input', () => {
    expect(mapFatSecretResponse('string')).toEqual([]);
    expect(mapFatSecretResponse(42)).toEqual([]);
  });

  it('returns empty array when food containers are missing', () => {
    expect(mapFatSecretResponse({ other: 'data' })).toEqual([]);
  });

  it('maps and normalizes macros to 100g from foods array', () => {
    const input = {
      foods: {
        food: [
          {
            food_id: '1',
            food_name: 'Chicken Breast',
            servings: {
              serving: {
                metric_serving_amount: '140',
                metric_serving_unit: 'g',
                carbohydrate: '0',
                protein: '43.4',
                fat: '5.04',
              },
            },
          },
        ],
      },
    };

    const result = mapFatSecretResponse(input);
    expect(result).toEqual([
      {
        id: '1',
        name: 'Chicken Breast',
        carbohydrate: 0,
        protein: 31,
        fat: 3.6,
        serving: 100,
      },
    ]);
  });

  it('uses first valid gram-based serving when multiple servings are present', () => {
    const input = {
      foods: {
        food: [
          {
            food_id: '2',
            food_name: 'Rice',
            servings: {
              serving: [
                {
                  metric_serving_amount: '1',
                  metric_serving_unit: 'cup',
                  carbohydrate: '44.5',
                  protein: '4.24',
                  fat: '0.45',
                },
                {
                  metric_serving_amount: '160',
                  metric_serving_unit: 'g',
                  carbohydrate: '44.5',
                  protein: '4.24',
                  fat: '0.45',
                },
              ],
            },
          },
        ],
      },
    };

    const result = mapFatSecretResponse(input);
    expect(result).toEqual([
      {
        id: '2',
        name: 'Rice',
        carbohydrate: 27.81,
        protein: 2.65,
        fat: 0.28,
        serving: 100,
      },
    ]);
  });

  it('skips foods without valid gram-based servings', () => {
    const input = {
      foods: {
        food: [
          {
            food_id: '3',
            food_name: 'No Grams',
            servings: {
              serving: {
                metric_serving_amount: '1',
                metric_serving_unit: 'oz',
                carbohydrate: '1',
                protein: '2',
                fat: '3',
              },
            },
          },
        ],
      },
    };

    const result = mapFatSecretResponse(input);
    expect(result).toEqual([]);
  });

  it('falls back to food_description grams when servings are missing', () => {
    const input = {
      foods: {
        food: [
          {
            food_id: '6',
            food_name: 'White Rice',
            food_description: 'Per 160g - Calories: 206kcal | Fat: 0.45g | Carbs: 44.50g | Protein: 4.24g',
          },
        ],
      },
    };

    const result = mapFatSecretResponse(input);
    expect(result).toEqual([
      {
        id: '6',
        name: 'White Rice',
        carbohydrate: 27.81,
        protein: 2.65,
        fat: 0.28,
        serving: 100,
      },
    ]);
  });

  it('skips food_description fallback when grams are not provided', () => {
    const input = {
      foods: {
        food: [
          {
            food_id: '7',
            food_name: 'Cup Rice',
            food_description: 'Per 1/4 cup - Calories: 160kcal | Fat: 0.00g | Carbs: 36.00g | Protein: 3.00g',
          },
        ],
      },
    };

    const result = mapFatSecretResponse(input);
    expect(result).toEqual([]);
  });

  it('skips foods when serving amount is invalid', () => {
    const input = {
      foods: {
        food: [
          {
            food_id: '4',
            food_name: 'Invalid Amount',
            servings: {
              serving: {
                metric_serving_amount: '0',
                metric_serving_unit: 'g',
                carbohydrate: '10',
                protein: '10',
                fat: '10',
              },
            },
          },
        ],
      },
    };
    const result = mapFatSecretResponse(input);
    expect(result).toEqual([]);
  });

  it('rounds values to 2 decimals', () => {
    const input = {
      foods: {
        food: {
          food_id: '5',
          food_name: 'Rounded',
          servings: {
            serving: {
              metric_serving_amount: '37',
              metric_serving_unit: 'g',
              carbohydrate: '4.321',
              protein: '1.678',
              fat: '0.789',
            },
          },
        },
      },
    };
    const result = mapFatSecretResponse(input);
    expect(result[0]).toEqual({
      id: '5',
      name: 'Rounded',
      carbohydrate: 11.68,
      protein: 4.54,
      fat: 2.13,
      serving: 100,
    });
  });
});

describe('FatSecretError', () => {
  it('has correct name and message', () => {
    const err = new FatSecretError('test error', 400, 'bad_request');
    expect(err.name).toBe('FatSecretError');
    expect(err.message).toBe('test error');
    expect(err.statusCode).toBe(400);
    expect(err.fatSecretCode).toBe('bad_request');
  });

  it('instanceof Error', () => {
    const err = new FatSecretError('test');
    expect(err instanceof Error).toBe(true);
    expect(err instanceof FatSecretError).toBe(true);
  });
});
