// The published kit's i18n: nothing until a host installs one.
//
// This file replaces `i18n-instance.ts` in the staged package. Without an
// install every key renders as itself, which is a legible placeholder rather
// than a crash, and it is what a consumer sees before they call `setKitI18n`.

import type { I18n, Locale, Messages, Translate } from '@kromatv/i18n';

/** An instance the kit's chrome can translate through, as `createI18n` builds
 *  one. `createI18n` is re-exported from this package, so a consumer needs no
 *  other install to make one. */
export type KitI18n = I18n<Locale, Messages>;

let installed: { i18n: KitI18n; defaultLocale: Locale } | null = null;

/**
 * Give the kit the catalogs its own chrome speaks through. Call it once, before
 * the first render: about ninety-five phrases (the player's controls, the stats
 * panel, a few formats) are read from it, and an uninstalled kit renders each
 * key as itself.
 */
export function setKitI18n(i18n: KitI18n, defaultLocale: Locale): void {
  installed = { i18n, defaultLocale };
}

const echo = ((key: string) => key) as Translate;

export function translatorFor(locale: Locale): Translate {
  return (installed?.i18n.translator(locale) as Translate | undefined) ?? echo;
}

export function fallbackLocale(): Locale {
  return installed?.defaultLocale ?? ('en' as Locale);
}

export function providerI18n(): KitI18n | undefined {
  return installed?.i18n;
}
