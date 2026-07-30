import settings from '../../project.inlang/settings.json';

// The locale list, read from the inlang project settings.
//
// That file is the SOURCE Paraglide's compiler reads, so this cannot drift from the
// generated runtime: both are the same list, one compiled and one imported. Reading it
// here rather than from `#site/paraglide/runtime` is what keeps the content loaders
// (lib/blog, lib/legal, lib/content-locale) free of generated code, so their logic is
// unit-testable without a build step having run first.
//
// The generated runtime is still the right source for everything that needs Paraglide's
// BEHAVIOUR - resolving the active locale, rewriting a URL - which is what lib/i18n
// wraps. This is only the list.

/** Every locale the site publishes, base locale included. */
export const LOCALES: readonly string[] = settings.locales;

/** The unprefixed locale, served at the clean root. */
export const BASE_LOCALE: string = settings.baseLocale;
