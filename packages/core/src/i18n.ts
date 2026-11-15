/// <reference path="./locales/messages.d.ts" />

// KROMA's whole i18n configuration: which languages the product speaks, what
// they say, and the instance every client and the workbench translate through.
// A folder under `locales/` is a language and `locales/i18n.json` is its
// policy: the source language, the fallback, and how far each one has come.

import { loadLocalePref, type SessionStorage } from '@kromatv/client';
import { defineI18n, type Locale } from '@kromatv/i18n';
import { catalogs, deferred, lazy, names } from './locales/catalogs';
import project from './locales/i18n.json';

export const {
  i18n,
  translate,
  translator: createTranslator,
  addCatalogs,
  detectLocale,
  isLocale,
  normalizeLocale,
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  LOCALES,
} = defineI18n({ catalogs, names, lazy, deferred, project });

/** The locale a device starts in, before any account preference is known: the
 *  override last picked here, else the browser's, else {@link DEFAULT_LOCALE}. */
export function deviceLocale(storage?: SessionStorage | null): Locale {
  const stored = loadLocalePref(storage);
  return isLocale(stored) ? stored : detectLocale();
}
