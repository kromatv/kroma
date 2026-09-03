import { readRaw, writeRaw } from './storage';

const LOCALE_KEY = 'kroma.locale';

/** The device-level UI locale override (what the user last picked on THIS
 * device), or null. Used before sign-in and as a fallback when the account has
 * no preference. */
export function loadLocalePref(): string | null {
  return readRaw(LOCALE_KEY);
}

/** Persist (or clear, with `null`) the device-level UI locale override. */
export function saveLocalePref(locale: string | null): void {
  writeRaw(LOCALE_KEY, locale);
}
