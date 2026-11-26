import type { Locale } from '@kromatv/i18n';
import type { SystemLanguageReach } from '../../modules/app-language';

/** The language the system holds for the app now and when the app last
 *  looked, beside the one picked on this device. */
export interface LanguageState {
  system: Locale | null;
  lastSeen: Locale | null;
  chosen: Locale | null;
}

/** What one comparison asks for, each null when there is nothing to do: the
 *  system's language to remember as seen, the language the app takes because
 *  the system moved to it, and the app's own choice for the system to hold. */
export interface LanguageSync {
  remember: Locale | null;
  follow: Locale | null;
  hand: Locale | null;
}

function moved(lastSeen: Locale | null, system: Locale | null): system is Locale {
  return lastSeen !== null && system !== null && system !== lastSeen;
}

/** Follows the system when its language for the app moved since the app last
 *  looked, and otherwise hands it the language picked here. The first look
 *  only remembers, so updating the app changes nobody's language. */
export function syncLanguage({ system, lastSeen, chosen }: LanguageState): LanguageSync {
  if (moved(lastSeen, system)) {
    return { remember: system, follow: system === chosen ? null : system, hand: null };
  }
  return {
    remember: system === lastSeen ? null : system,
    follow: null,
    hand: chosen === system ? null : chosen,
  };
}

/** The language the system's settings hold for the app, when it is not the
 *  one on screen and only the user can change it there. */
export function languageToChangeInSettings(
  reach: SystemLanguageReach,
  { system, locale }: Readonly<{ system: Locale | null; locale: Locale }>,
): Locale | null {
  return reach === 'open' && system !== null && system !== locale ? system : null;
}
