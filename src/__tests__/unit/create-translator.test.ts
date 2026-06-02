import { createTranslator } from '../../translation/create-translator';
import { GoogleTranslateClient } from '../../translation/google-translate-client';
import { TranslationProviderConfigurationError } from '../../translation/translator';
import { hasCredentialsForTranslationProvider } from '../../config';

describe('createTranslator', () => {
  it('returns Google translator when provider is google', () => {
    const translator = createTranslator('google');
    expect(translator).toBeInstanceOf(GoogleTranslateClient);
  });

  it('throws a provider-neutral error for unsupported providers', () => {
    expect(() => createTranslator('llama')).toThrow(TranslationProviderConfigurationError);
    expect(() => createTranslator('llama')).toThrow('Unsupported translation provider: llama');
  });

  it('checks credentials through an explicit selected-provider helper', () => {
    process.env['GOOGLE_TRANSLATE_API_KEY'] = 'test-key';
    expect(hasCredentialsForTranslationProvider('google')).toBe(true);

    delete process.env['GOOGLE_TRANSLATE_API_KEY'];
    expect(hasCredentialsForTranslationProvider('google')).toBe(false);
  });

  it('throws a provider-neutral error when checking unsupported provider credentials', () => {
    expect(() => hasCredentialsForTranslationProvider('llama')).toThrow(TranslationProviderConfigurationError);
    expect(() => hasCredentialsForTranslationProvider('llama')).toThrow('Unsupported translation provider: llama');
  });
});
