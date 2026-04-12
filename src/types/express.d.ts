import type { SupportedLanguage } from '../modules/user/supportedLanguages';

type LanguageSource = 'header' | 'query' | 'jwt' | 'default';

declare global {
  namespace Express {
    interface Request {
      jwtUserId?: string;
      jwtPreferredLanguage?: string | null;
      resolvedLanguage: SupportedLanguage;
      languageSource: LanguageSource;
    }
  }
}

export {};
