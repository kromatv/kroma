// Every shared user-facing setting, declared once: identity, level, binding and
// presentation. Screens compose menus from these lists (plus screen-local
// actionItems built inline, e.g. the PIN row which needs auth + nav context).

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
import { crashReportingPrefStore } from '#tv/app/crashReportingPref';
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
import {
  ARTWORK_SCALE,
  type ArtworkQuality,
  artworkPrefStore,
  perfHudPrefStore,
  useStoredPref,
} from './store';

export const localeSetting: SettingsItem = choiceItem({
  id: 'locale',
  level: 'account',
  label: 'common.language',
  icon: 'language',
  options: () => LOCALES.map((l) => l.code),
  valueLabel: (code) => LOCALES.find((l) => l.code === code)?.labelKey ?? 'common.language',
  useValue: () => [useLocale(), useSetLocale()] as const,
});

export const audioLanguageSetting: SettingsItem = choiceItem({
  id: 'audioLanguage',
  level: 'account',
  label: 'account.audioLanguage',
  icon: 'volume',
  pick: 'list',
  options: (t, locale) => [LANG_NO_PREF, ...langCodes(t, locale)],
  valueLabel: langValueLabel,
  useValue: () => {
    const { audio, setAudio } = useLangPrefs();
    return [prefValue(audio), setAudio] as const;
  },
});

export const subtitleLanguageSetting: SettingsItem = choiceItem({
  id: 'subtitleLanguage',
  level: 'account',
  label: 'account.subtitleLanguage',
  icon: 'badge-cc',
  pick: 'list',
  options: (t, locale) => [LANG_NO_PREF, LANG_OFF, ...langCodes(t, locale)],
  valueLabel: langValueLabel,
  useValue: () => {
    const { subtitle, setSubtitle } = useLangPrefs();
    return [prefValue(subtitle), setSubtitle] as const;
  },
});

function langCodes(t: Translate, locale: Locale): string[] {
  return langOptions(t, locale).map((option) => option.code);
}

function langValueLabel(value: string): MessageKey {
  if (value === LANG_OFF) return 'player.subtitlesOff';
  return langKey(value) ?? 'account.noPreference';
}

export const keyboardLayoutSetting: SettingsItem = choiceItem({
  id: 'keyboardLayout',
  level: 'device',
  label: 'keyboardLayout.title',
  icon: 'keyboard',
  options: () => ALL_KEYBOARD_LAYOUTS,
  valueLabel: (v) => KEYBOARD_LAYOUT_LABEL_KEY[v],
  useValue: () => useStoredPref(keyboardLayoutStore),
});

export const engineSetting: SettingsItem = choiceItem({
  id: 'playbackEngine',
  level: 'device',
  label: 'playbackEngine.title',
  icon: 'movie',
  options: availableEngines,
  valueLabel: (v) => ENGINE_LABEL_KEY[v],
  useValue: () => useStoredPref(enginePrefStore),
});

export const gpuRenderingSetting: SettingsItem = toggleItem({
  id: 'gpuRendering',
  level: 'shell',
  label: 'profileMenu.gpuRendering',
  icon: 'cpu',
  available: gpuToggleAvailable,
  useValue: () => {
    const [on, setOn] = useState(false);
    useEffect(() => {
      void getGpuRendering().then(setOn);
    }, []);
    const set = (next: boolean) => {
      setOn(next);
      void setGpuRendering(next);
    };
    return [on, set] as const;
  },
});

export const artworkSetting: SettingsItem = choiceItem({
  id: 'artworkQuality',
  level: 'device',
  label: 'artworkQuality.title',
  icon: 'photo',
  options: () => Object.keys(ARTWORK_SCALE) as ArtworkQuality[],
  valueLabel: (v) => `artworkQuality.${v}` as MessageKey,
  useValue: () => useStoredPref(artworkPrefStore),
});

export const perfHudSetting: SettingsItem = toggleItem({
  id: 'perfHud',
  level: 'device',
  label: 'profileMenu.perfHud',
  icon: 'gauge',
  useValue: () => {
    const [on, set] = useStoredPref(perfHudPrefStore);
    return [on === 'on', (next: boolean) => set(next ? 'on' : 'off')] as const;
  },
});

export const castReceiverSetting: SettingsItem = toggleItem({
  id: 'castReceiver',
  level: 'device',
  label: 'settings.castReceiver',
  icon: 'cast',
  useValue: () => {
    const [on, set] = useStoredPref(castReceiverPrefStore);
    return [on === 'on', (next: boolean) => set(next ? 'on' : 'off')] as const;
  },
});

export const crashReportingSetting: SettingsItem = toggleItem({
  id: 'crashReporting',
  level: 'device',
  label: 'settings.crashReporting',
  icon: 'bug',
  useValue: () => {
    const [on, set] = useStoredPref(crashReportingPrefStore);
    return [on === 'on', (next: boolean) => set(next ? 'on' : 'off')] as const;
  },
});

export const quitAppItem: SettingsItem = actionItem({
  id: 'quitApp',
  label: 'profileMenu.quitApp',
  icon: 'power',
  available: canQuitApp,
  run: quitApp,
});

export function aboutItem(open: () => void): SettingsItem {
  return actionItem({ id: 'about', label: 'about.title', icon: 'info-circle', run: open });
}

export const DEVICE_SETTINGS: readonly SettingsItem[] = [
  localeSetting,
  keyboardLayoutSetting,
  castReceiverSetting,
  gpuRenderingSetting,
  artworkSetting,
  perfHudSetting,
  crashReportingSetting,
];

export const PROFILE_SETTINGS: readonly SettingsItem[] = [
  localeSetting,
  audioLanguageSetting,
  subtitleLanguageSetting,
  keyboardLayoutSetting,
  engineSetting,
  castReceiverSetting,
  gpuRenderingSetting,
  artworkSetting,
  perfHudSetting,
  crashReportingSetting,
];

// Signed in, the flat settings block plus account rows is taller than a 1080
// screen, so it collapses into three rows that each open a group screen.

export type SettingsGroupId = 'languages' | 'playback' | 'device';

export interface SettingsGroup {
  id: SettingsGroupId;
  label: MessageKey;
  icon: RowIcon;
  items: readonly SettingsItem[];
}

export const SETTINGS_GROUPS: Record<SettingsGroupId, SettingsGroup> = {
  languages: {
    id: 'languages',
    label: 'settings.languages',
    icon: 'language',
    items: [localeSetting, audioLanguageSetting, subtitleLanguageSetting],
  },
  playback: {
    id: 'playback',
    label: 'settings.playback',
    icon: 'movie',
    items: [engineSetting, perfHudSetting],
  },
  device: {
    id: 'device',
    label: 'settings.device',
    icon: 'device-tv',
    items: [
      keyboardLayoutSetting,
      castReceiverSetting,
      gpuRenderingSetting,
      artworkSetting,
      crashReportingSetting,
    ],
  },
};

/** Hidden when the platform gates away every item inside the group. */
export function groupItem(group: SettingsGroup, open: () => void): SettingsItem {
  return actionItem({
    id: `group:${group.id}`,
    icon: group.icon,
    label: group.label,
    available: () => group.items.some((item) => !item.available || item.available()),
    run: open,
  });
}
