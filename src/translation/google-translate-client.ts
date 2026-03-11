import axios, { AxiosError } from 'axios';
import { config } from '../config';
import { logger } from '../logger';

interface GoogleTranslateDetectionResponse {
  data?: {
    detections?: Array<Array<{ language?: string }>>;
  };
}

interface GoogleTranslateTextResponse {
  data?: {
    translations?: Array<{ translatedText?: string }>;
  };
}

const HTML_ENTITY_MAP: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: '\'',
};

function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (_match, entity: string) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      const codePoint = Number.parseInt(entity.slice(2), 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : _match;
    }
    if (entity.startsWith('#')) {
      const codePoint = Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : _match;
    }
    return HTML_ENTITY_MAP[entity] ?? _match;
  });
}

function isTransientError(error: unknown): boolean {
  if (!(error instanceof AxiosError)) return false;
  const status = error.response?.status;
  if (!status) return true;
  return status === 429 || status >= 500;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export interface Translator {
  detectLanguage(text: string): Promise<string | null>;
  translateText(text: string, targetLanguage: string, sourceLanguage?: string): Promise<string>;
  translateTexts(texts: string[], targetLanguage: string, sourceLanguage?: string): Promise<string[]>;
}

export class GoogleTranslateClient implements Translator {
  private async postWithRetry<TResponse>(url: string, body: Record<string, unknown>): Promise<TResponse> {
    const maxAttempts = config.translationRetries + 1;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const response = await axios.post<TResponse>(
          url,
          body,
          {
            params: { key: config.googleTranslateApiKey() },
            timeout: config.translationTimeoutMs,
          },
        );
        return response.data;
      } catch (error) {
        lastError = error;
        if (attempt < maxAttempts && isTransientError(error)) {
          const delay = config.translationRetryBaseDelayMs * Math.pow(2, attempt - 1);
          logger.warn({ attempt, delay }, 'Transient Google Translate error; retrying');
          await sleep(delay);
          continue;
        }
        break;
      }
    }

    throw lastError;
  }

  async detectLanguage(text: string): Promise<string | null> {
    const query = text.trim();
    if (query.length === 0) return null;

    const response = await this.postWithRetry<GoogleTranslateDetectionResponse>(
      `${config.googleTranslateBaseUrl}/detect`,
      { q: query },
    );

    const language = response.data?.detections?.[0]?.[0]?.language;
    return typeof language === 'string' && language.trim().length > 0
      ? language
      : null;
  }

  async translateText(text: string, targetLanguage: string, sourceLanguage?: string): Promise<string> {
    const [translated] = await this.translateTexts([text], targetLanguage, sourceLanguage);
    return translated ?? text;
  }

  async translateTexts(
    texts: string[],
    targetLanguage: string,
    sourceLanguage?: string,
  ): Promise<string[]> {
    if (texts.length === 0) return [];

    const body: Record<string, unknown> = {
      q: texts,
      target: targetLanguage,
      format: 'text',
    };

    if (sourceLanguage) {
      body['source'] = sourceLanguage;
    }

    const response = await this.postWithRetry<GoogleTranslateTextResponse>(
      config.googleTranslateBaseUrl,
      body,
    );

    const translations = response.data?.translations ?? [];
    return texts.map((text, index) => {
      const translated = translations[index]?.translatedText;
      if (!translated) return text;
      return decodeHtmlEntities(translated);
    });
  }
}
