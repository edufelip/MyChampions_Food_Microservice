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

  it('returns empty array when foods property is missing', () => {
    expect(mapFatSecretResponse({ other: 'data' })).toEqual([]);
  });

  it('returns empty array when food property is missing', () => {
    expect(mapFatSecretResponse({ foods: {} })).toEqual([]);
  });

  it('maps array of food items correctly', () => {
    const input = {
      foods: {
        food: [
          { food_id: '1', food_name: 'Chicken Breast' },
          { food_id: '2', food_name: 'Salmon' },
        ],
      },
    };
    const result = mapFatSecretResponse(input);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ food_id: '1', food_name: 'Chicken Breast' });
  });

  it('wraps single object result in array (FatSecret quirk)', () => {
    const input = {
      foods: {
        food: { food_id: '1', food_name: 'Chicken Breast' },
      },
    };
    const result = mapFatSecretResponse(input);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ food_id: '1', food_name: 'Chicken Breast' });
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
