export type TranslationProvider = 'google';

export interface Translator {
  detectLanguage(text: string): Promise<string | null>;
  translateText(text: string, targetLanguage: string, sourceLanguage?: string): Promise<string>;
  translateTexts(texts: string[], targetLanguage: string, sourceLanguage?: string): Promise<string[]>;
}

export class TranslationProviderConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TranslationProviderConfigurationError';
  }
}
