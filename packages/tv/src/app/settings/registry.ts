import { useDevicePreferences } from '../device-preferences';
// Every shared user-facing setting, declared once: identity, level, binding and
// presentation. The groups in groups.ts arrange them into screens.

import { LANG_NO_PREF, LANG_OFF, LOCALES, langKey, langOptions } from '@kromatv/core';
import type { Locale, MessageKey, Translate } from '@kromatv/i18n';
import { useLocale, useSetLocale } from '@kromatv/ui';
import { useEffect, useState } from 'react';
import { getGpuRendering, gpuToggleAvailable, setGpuRendering } from '#tv/app/desktopGpu';
import { availableEngines, ENGINE_LABEL_KEY, useEnginePref } from '#tv/app/enginePref';
import { ALL_KEYBOARD_LAYOUTS, KEYBOARD_LAYOUT_LABEL_KEY } from '#tv/app/keyboardLayoutPref';
import { prefValue, useLangPrefs } from '#tv/app/langPref';
import { choiceItem, type SettingsItem, toggleItem } from './items';
import {
  ARTWORK_SCALE,
  type ArtworkQuality,
  useArtworkPref,
  useBlurPref,
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
  summary: 'settings.audioSummary',
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
  summary: 'settings.subtitleSummary',
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
  summary: 'settings.keyboardSummary',
  options: () => ALL_KEYBOARD_LAYOUTS,
  valueLabel: (v) => KEYBOARD_LAYOUT_LABEL_KEY[v],
  useValue: () => useStoredPref(useDevicePreferences().keyboard),
});

export const engineSetting: SettingsItem = choiceItem({
  id: 'playbackEngine',
  level: 'device',
  label: 'playbackEngine.title',
  icon: 'movie',
  options: availableEngines,
  valueLabel: (v) => ENGINE_LABEL_KEY[v],
  useValue: () => useStoredPref(useEnginePref()),
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
  summary: 'settings.artworkSummary',
  options: () => Object.keys(ARTWORK_SCALE) as ArtworkQuality[],
  valueLabel: (v) => `artworkQuality.${v}` as MessageKey,
  useValue: () => useStoredPref(useArtworkPref()),
});

export const blurSetting: SettingsItem = toggleItem({
  id: 'blur',
  level: 'device',
  label: 'settings.blur',
  icon: 'blur',
  useValue: () => {
    const [on, set] = useStoredPref(useBlurPref());
    return [on === 'on', (next: boolean) => set(next ? 'on' : 'off')] as const;
  },
});

export const perfHudSetting: SettingsItem = toggleItem({
  id: 'perfHud',
  level: 'device',
  label: 'profileMenu.perfHud',
  icon: 'gauge',
  useValue: () => {
    const [on, set] = useStoredPref(useDevicePreferences().perfHud);
    return [on === 'on', (next: boolean) => set(next ? 'on' : 'off')] as const;
  },
});

export const castReceiverSetting: SettingsItem = toggleItem({
  id: 'castReceiver',
  level: 'device',
  label: 'settings.castReceiver',
  icon: 'cast',
  useValue: () => {
    const [on, set] = useStoredPref(useDevicePreferences().castReceiver);
    return [on === 'on', (next: boolean) => set(next ? 'on' : 'off')] as const;
  },
});

export const crashReportingSetting: SettingsItem = toggleItem({
  id: 'crashReporting',
  level: 'device',
  label: 'settings.crashReporting',
  icon: 'bug',
  useValue: () => {
    const [on, set] = useStoredPref(useDevicePreferences().crashReporting);
    return [on === 'on', (next: boolean) => set(next ? 'on' : 'off')] as const;
  },
});
