import type { SessionStorage } from '@kromatv/client';
// User-selectable on-screen keyboard layout, persisted per device (like the
// playback-engine override in enginePref.ts). Surfaced as a cycle-row in the
// profile menu and honored by the two remote keyboards' letter grids.
//
//  - abc    : alphabetical rows (the classic TV grid, default).
//  - azerty : French typewriter order.
//  - qwerty : US/UK typewriter order.
//  - qwertz : German/Swiss typewriter order.

import type { MessageKey } from '@kromatv/i18n';
import { KEYBOARD_LAYOUTS, type KeyboardLayout } from '@kromatv/ui/kit';
import { reactivePref } from '#tv/app/settings/store';

// The letter orders themselves are the kit's (its <SearchKeyboard> and
// <UrlKeyboard> render them); this module only persists WHICH one this device
// wants.
export type KeyboardLayoutPref = KeyboardLayout;

export const ALL_KEYBOARD_LAYOUTS: readonly KeyboardLayoutPref[] = KEYBOARD_LAYOUTS;

export function createKeyboardLayoutPref(storage?: SessionStorage | null) {
  return reactivePref('kroma:kbd-layout', ALL_KEYBOARD_LAYOUTS, 'abc', storage);
}

export const KEYBOARD_LAYOUT_LABEL_KEY: Record<KeyboardLayoutPref, MessageKey> = {
  abc: 'keyboardLayout.abc',
  azerty: 'keyboardLayout.azerty',
  qwerty: 'keyboardLayout.qwerty',
  qwertz: 'keyboardLayout.qwertz',
};
