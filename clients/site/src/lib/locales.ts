import settings from '../../project.inlang/settings.json';

// The locale list, read from the inlang settings Paraglide compiles, rather than
// from the generated runtime — that keeps the content loaders testable without a
// build step. Anything needing Paraglide's behaviour belongs in lib/i18n.

export const LOCALES: readonly string[] = settings.locales;

export const BASE_LOCALE: string = settings.baseLocale;
