// Every shared user-facing setting, declared ONCE: identity, level, binding and
// presentation. Screens compose menus from these lists (plus screen-local
// actionItems built inline, e.g. the PIN row which needs auth + nav context).
//
// Adding a setting = one declaration here + one entry in a menu list. The row
// UI, the cycle logic, the platform gating and the cross-component reactivity
// all come from items.ts / store.ts / <SettingsRows>.

import {
  LANG_NO_PREF,
  LANG_OFF,
  LOCALES,
  type Locale,
  langKey,
  langOptions,
  type MessageKey,
  type Translate,
} from '@kroma/core';
import { useLocale, useSetLocale } from '@kroma/ui';
import { useEffect, useState } from 'react';
import { canQuitApp, quitApp } from '#tv/app/appQuit';
import { getGpuRendering, gpuToggleAvailable, setGpuRendering } from '#tv/app/desktopGpu';
import { availableEngines, ENGINE_LABEL_KEY, enginePrefStore } from '#tv/app/enginePref';
import {
  ALL_KEYBOARD_LAYOUTS,
  KEYBOARD_LAYOUT_LABEL_KEY,
  keyboardLayoutStore,
} from '#tv/app/keyboardLayoutPref';
import { prefValue, useLangPrefs } from '#tv/app/langPref';
import { castReceiverPrefStore } from '#tv/features/cast/castPref';
import { actionItem, choiceItem, type RowIcon, type SettingsItem, toggleItem } from './items';
import { perfHudPrefStore, useStoredPref } from './store';

/** Interface language. Account level: the I18nProvider owns the value and the
 * app persists + syncs a change to the signed-in account. */
export const localeSetting: SettingsItem = choiceItem({
  id: 'locale',
  level: 'account',
  label: 'common.language',
  icon: 'language',
  options: () => LOCALES.map((l) => l.code),
  // The find can't miss: options() only offers LOCALES codes.
  valueLabel: (code) => LOCALES.find((l) => l.code === code)?.labelKey ?? 'common.language',
  use: () => [useLocale(), useSetLocale()] as const,
});

/** Preferred audio language: the track a title opens on whenever the file
 * carries it. Account level, so it follows the viewer to the web and the phone.
 * The player's audio picker writes it too - choosing French once is the setting.
 *
 * `pick: 'list'` because the offer is every language there is (see PREF_LANGS):
 * the sentinel first, then the languages ordered by their name in the reader's
 * own language, which is the only order a picker that long can be read in. */
export const audioLanguageSetting: SettingsItem = choiceItem({
  id: 'audioLanguage',
  level: 'account',
  label: 'account.audioLanguage',
  icon: 'volume',
  pick: 'list',
  options: (t, locale) => [LANG_NO_PREF, ...langCodes(t, locale)],
  valueLabel: langValueLabel,
  use: () => {
    const { audio, setAudio } = useLangPrefs();
    return [prefValue(audio), setAudio] as const;
  },
});

/** Preferred subtitle language, with an explicit "off" alongside the languages:
 * "never show subtitles" is a real preference, distinct from "no preference". */
export const subtitleLanguageSetting: SettingsItem = choiceItem({
  id: 'subtitleLanguage',
  level: 'account',
  label: 'account.subtitleLanguage',
  icon: 'badge-cc',
  pick: 'list',
  options: (t, locale) => [LANG_NO_PREF, LANG_OFF, ...langCodes(t, locale)],
  valueLabel: langValueLabel,
  use: () => {
    const { subtitle, setSubtitle } = useLangPrefs();
    return [prefValue(subtitle), setSubtitle] as const;
  },
});

/** The languages themselves, alphabetical by their translated name. */
function langCodes(t: Translate, locale: Locale): string[] {
  return langOptions(t, locale).map((option) => option.code);
}

/** Row label for a language preference value (a code, `none`, or `off`). */
function langValueLabel(value: string): MessageKey {
  if (value === LANG_OFF) return 'player.subtitlesOff';
  // The options only ever offer PREF_LANGS, which all have a catalog name.
  return langKey(value) ?? 'account.noPreference';
}

/** On-screen keyboard letter order (ABC / AZERTY / QWERTY / QWERTZ). */
export const keyboardLayoutSetting: SettingsItem = choiceItem({
  id: 'keyboardLayout',
  level: 'device',
  label: 'keyboardLayout.title',
  icon: 'keyboard',
  options: () => ALL_KEYBOARD_LAYOUTS,
  valueLabel: (v) => KEYBOARD_LAYOUT_LABEL_KEY[v],
  use: () => useStoredPref(keyboardLayoutStore),
});

/** Playback engine override. Hides itself on single-engine platforms (the
 * choice-row rule: fewer than two options = no row). */
export const engineSetting: SettingsItem = choiceItem({
  id: 'playbackEngine',
  level: 'device',
  label: 'playbackEngine.title',
  icon: 'movie',
  options: availableEngines,
  valueLabel: (v) => ENGINE_LABEL_KEY[v],
  use: () => useStoredPref(enginePrefStore),
});

/** Webview GPU renderer, Linux desktop shell only. Shell level: persisted in
 * the shell's config file and applied at boot, so flipping it relaunches. */
export const gpuRenderingSetting: SettingsItem = toggleItem({
  id: 'gpuRendering',
  level: 'shell',
  label: 'profileMenu.gpuRendering',
  icon: 'cpu',
  available: gpuToggleAvailable,
  use: () => {
    const [on, setOn] = useState(false);
    useEffect(() => {
      void getGpuRendering().then(setOn);
    }, []);
    const set = (next: boolean) => {
      setOn(next);
      void setGpuRendering(next); // persists, then relaunches the app
    };
    return [on, set] as const;
  },
});

/**
 * The performance read-out, on the screen it is about.
 *
 * A television is the only place these numbers mean anything and the hardest
 * place to attach a profiler, so the app carries its own: frame time, worst
 * frame, and press-to-focus. Left in the shipped build deliberately - the cost
 * when it is off is one boolean, and the alternative is guessing about a device
 * that is not on the desk.
 */
export const perfHudSetting: SettingsItem = toggleItem({
  id: 'perfHud',
  level: 'device',
  label: 'profileMenu.perfHud',
  icon: 'gauge',
  use: () => {
    const [on, set] = useStoredPref(perfHudPrefStore);
    return [on === 'on', (next: boolean) => set(next ? 'on' : 'off')] as const;
  },
});

/** Whether this TV joins the cast roster, i.e. whether a phone or a browser on
 * this server may start a title on it and drive playback. Device-level and on by
 * default: a set in the living room is exactly the thing a remote wants to
 * reach. Turning it off unregisters the receiver at once. */
export const castReceiverSetting: SettingsItem = toggleItem({
  id: 'castReceiver',
  level: 'device',
  label: 'settings.castReceiver',
  icon: 'cast',
  use: () => {
    const [on, set] = useStoredPref(castReceiverPrefStore);
    return [on === 'on', (next: boolean) => set(next ? 'on' : 'off')] as const;
  },
});

/** Quit the app - desktop + Android TV shells (fullscreen, no window chrome). */
export const quitAppItem: SettingsItem = actionItem({
  id: 'quitApp',
  label: 'profileMenu.quitApp',
  icon: 'power',
  available: canQuitApp,
  run: quitApp,
});

/** Which build is running (route `about`). A factory, not a constant, because
 * the row navigates and only the screen holds a navigator - the same reason the
 * profile menu's PIN row is built inline. */
export function aboutItem(open: () => void): SettingsItem {
  return actionItem({ id: 'about', label: 'about.title', icon: 'info-circle', run: open });
}

/** The signed-out device-settings screen: everything a fresh install needs.
 * `aboutItem` and `quitAppItem` are appended by the screen, after this block -
 * the first needs a navigator, and the second belongs last on any menu. */
export const DEVICE_SETTINGS: readonly SettingsItem[] = [
  localeSetting,
  keyboardLayoutSetting,
  castReceiverSetting,
  gpuRenderingSetting,
  perfHudSetting,
];

/** The settings block at the top of the signed-in profile menu. */
export const PROFILE_SETTINGS: readonly SettingsItem[] = [
  localeSetting,
  audioLanguageSetting,
  subtitleLanguageSetting,
  keyboardLayoutSetting,
  engineSetting,
  castReceiverSetting,
  gpuRenderingSetting,
  perfHudSetting,
];

// ---- groups: the same settings, one step deeper ----
//
// Signed in, the flat block above plus the account rows is twelve rows, which is
// taller than a 1080 screen: the name and avatar scrolled off the top, and the
// remote walked past six things nobody came for to reach "Sign out". A menu that
// does not fit is also a menu you cannot see at a glance, which on a television
// is most of what a menu is for.
//
// So the settings half becomes three rows that open a screen each. The items
// themselves do not change - a group is a NAME and a list, and the sub-screen
// renders it with the same <SettingsRows> - so nothing about how a setting is
// declared, bound or persisted moves.

export type SettingsGroupId = 'languages' | 'playback' | 'device';

export interface SettingsGroup {
  id: SettingsGroupId;
  label: MessageKey;
  icon: RowIcon;
  items: readonly SettingsItem[];
}

export const SETTINGS_GROUPS: Record<SettingsGroupId, SettingsGroup> = {
  /** What the app speaks, and what a title should open in. */
  languages: {
    id: 'languages',
    label: 'settings.languages',
    icon: 'language',
    items: [localeSetting, audioLanguageSetting, subtitleLanguageSetting],
  },
  /** How a title plays. */
  playback: {
    id: 'playback',
    label: 'settings.playback',
    icon: 'movie',
    items: [engineSetting, perfHudSetting],
  },
  /** This box, not this account: the on-screen keyboard and the shell's own
   *  rendering switch. Both are device-level, so they are the group that still
   *  makes sense signed out. */
  device: {
    id: 'device',
    label: 'settings.device',
    icon: 'device-tv',
    items: [keyboardLayoutSetting, castReceiverSetting, gpuRenderingSetting],
  },
};

/** The row that opens one group. Hidden when the platform gates away every item
 * inside it - a group whose screen would be empty is not a place to send anyone. */
export function groupItem(group: SettingsGroup, open: () => void): SettingsItem {
  return actionItem({
    id: `group:${group.id}`,
    icon: group.icon,
    label: group.label,
    available: () => group.items.some((item) => !item.available || item.available()),
    run: open,
  });
}
