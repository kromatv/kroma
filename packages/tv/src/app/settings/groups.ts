import type { MessageKey } from '@kromatv/i18n';
import type { RowIcon, SettingsItem } from './items';
import {
  artworkSetting,
  audioLanguageSetting,
  blurSetting,
  castReceiverSetting,
  crashReportingSetting,
  engineSetting,
  gpuRenderingSetting,
  keyboardLayoutSetting,
  localeSetting,
  perfHudSetting,
  subtitleLanguageSetting,
} from './registry';

export type SettingsGroupId = 'languages' | 'playback' | 'device';

/** One entry of the settings screen's left pane, and the rows it shows on the right. */
export interface SettingsGroup {
  id: SettingsGroupId;
  label: MessageKey;
  icon: RowIcon;
  items: readonly SettingsItem[];
  /** The choices whose values make the group's one-line summary, in order. */
  summary: readonly SettingsItem[];
}

const languages: SettingsGroup = {
  id: 'languages',
  label: 'settings.languages',
  icon: 'language',
  items: [localeSetting, audioLanguageSetting, subtitleLanguageSetting],
  summary: [localeSetting, audioLanguageSetting, subtitleLanguageSetting],
};

const playback: SettingsGroup = {
  id: 'playback',
  label: 'settings.playback',
  icon: 'movie',
  items: [engineSetting, perfHudSetting],
  summary: [engineSetting],
};

const deviceItems = [
  keyboardLayoutSetting,
  castReceiverSetting,
  gpuRenderingSetting,
  artworkSetting,
  blurSetting,
  crashReportingSetting,
];

const device: SettingsGroup = {
  id: 'device',
  label: 'settings.device',
  icon: 'device-tv',
  items: deviceItems,
  summary: [keyboardLayoutSetting, artworkSetting],
};

/** Signed in: every setting, each in exactly one group. */
export const PROFILE_GROUPS: readonly SettingsGroup[] = [languages, playback, device];

/** Signed out: only what this television keeps without an account. */
export const DEVICE_GROUPS: readonly SettingsGroup[] = [
  { ...languages, items: [localeSetting], summary: [localeSetting] },
  { ...device, items: [...deviceItems, perfHudSetting] },
];

/** False when the platform gates away every item inside the group. */
export function groupAvailable(group: SettingsGroup): boolean {
  return group.items.some((item) => !item.available || item.available());
}
