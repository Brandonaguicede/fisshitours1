export type TermsLanguage = 'en' | 'es';
export interface TermsSection { id: string; title: string; items: string[] }
export interface Terms { version: string; language: TermsLanguage; sections: TermsSection[] }
export const TERMS_VERSIONS: Readonly<Record<string, { version: string; sections: ReadonlyArray<{ id: string; title: Readonly<Record<TermsLanguage, string>>; items: ReadonlyArray<Readonly<Record<TermsLanguage, string>>> }> }>>;
export const CURRENT_TERMS_VERSION: string;
export const TERMS_LANGUAGES: ReadonlyArray<TermsLanguage>;
export type TermsRegistry = typeof TERMS_VERSIONS;
export function isKnownTermsVersion(version: unknown, registry?: TermsRegistry): boolean;
export const ALLOW_LEGACY_CLIENTS_WITHOUT_TERMS: boolean;
export function checkTermsAcceptance(input: { termsAccepted?: unknown; termsVersion?: unknown }, options?: { allowLegacy?: boolean }): { ok: true; termsVersion: string; legacy?: undefined } | { ok: true; legacy: true; termsVersion?: undefined } | { ok: false; status: number; code: 'TERMS_NOT_ACCEPTED' | 'TERMS_VERSION_UNKNOWN' | 'TERMS_VERSION_OUTDATED' };
export function getTerms(version: string, language: TermsLanguage, registry?: TermsRegistry): Terms;
export function renderTermsText(version: string, language: TermsLanguage, registry?: TermsRegistry): string;
