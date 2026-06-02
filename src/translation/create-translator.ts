import { config } from '../config';
import { GoogleTranslateClient } from './google-translate-client';
import {
  TranslationProvider,
  TranslationProviderConfigurationError,
  Translator,
} from './translator';

export function parseTranslationProvider(value: string): TranslationProvider {
  if (value === 'google') return value;
  throw new TranslationProviderConfigurationError(`Unsupported translation provider: ${value}`);
}

export function createTranslator(provider: string = config.translationProvider): Translator {
  const parsedProvider = parseTranslationProvider(provider);

  if (parsedProvider === 'google') {
    return new GoogleTranslateClient();
  }

  throw new TranslationProviderConfigurationError(`Unsupported translation provider: ${provider}`);
}
