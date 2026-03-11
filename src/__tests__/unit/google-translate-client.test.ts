import axios from 'axios';
import { AxiosError } from 'axios';
import { GoogleTranslateClient } from '../../translation/google-translate-client';

jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('GoogleTranslateClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env['GOOGLE_TRANSLATE_API_KEY'] = 'test-key';
  });

  it('decodes HTML entities from translated text payload', async () => {
    mockedAxios.post = jest.fn().mockResolvedValue({
      data: {
        data: {
          translations: [
            { translatedText: 'Peito &amp; Frango' },
            { translatedText: '&#225;gua' },
            { translatedText: '&#xE7;ucar' },
          ],
        },
      },
    } as never);

    const client = new GoogleTranslateClient();
    const result = await client.translateTexts(['Chicken', 'Water', 'Sugar'], 'pt-BR', 'en');

    expect(result).toEqual(['Peito & Frango', 'água', 'çucar']);
  });

  it('retries on transient translation errors and succeeds', async () => {
    mockedAxios.post = jest.fn()
      .mockRejectedValueOnce(new AxiosError('temporary outage'))
      .mockResolvedValueOnce({
        data: {
          data: {
            translations: [{ translatedText: 'Frango' }],
          },
        },
      } as never);

    const client = new GoogleTranslateClient();
    const result = await client.translateTexts(['Chicken'], 'pt-BR', 'en');

    expect(result).toEqual(['Frango']);
    expect(mockedAxios.post).toHaveBeenCalledTimes(2);
  });
});
