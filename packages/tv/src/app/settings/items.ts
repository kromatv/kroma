// The declarative settings model: a settings menu is a plain list of items,
// each declared once (identity, level, binding, presentation) and rendered by
// <SettingsRows>. Three kinds cover every row:
//
//  - choice : cycles through the currently-offerable values on OK; hides
//             itself when there is no real choice (fewer than two).
//  - toggle : boolean on/off with a colored badge.
//  - action : fires a handler, optional badge.
//
// `level` names WHERE a value lives: device (localStorage, settings/store.ts),
// shell (the desktop shell's config file, applied at boot), or account
// (synced to the signed-in account by the server).

import type { Locale, MessageKey, Translate } from '@kroma/core';
import type { IconName } from '@kroma/ui/kit';

export type SettingsLevel = 'device' | 'shell' | 'account';

/** Icon slot: a name from the kit's generated glyph set (see its registry). */
export type RowIcon = IconName;

/** Trailing status badge (the PIN row's On, a toggle's Off...). */
export interface RowBadge {
  label: MessageKey;
  tone: 'success' | 'dim';
}

interface BaseItem {
  id: string;
  icon: RowIcon;
  label: MessageKey;
  available?: () => boolean;
}

/** `cycle` steps to the next value in place; `list` opens a dialog instead,
 * for a choice too long to cycle through (e.g. the full language list). */
export type ChoicePick = 'cycle' | 'list';

export interface ChoiceItem extends BaseItem {
  kind: 'choice';
  level: SettingsLevel;
  options: (t: Translate, locale: Locale) => readonly string[];
  valueLabel: (value: string) => MessageKey;
  use: () => readonly [string, (value: string) => void];
  pick?: ChoicePick;
}

export interface ToggleItem extends BaseItem {
  kind: 'toggle';
  level: SettingsLevel;
  use: () => readonly [boolean, (value: boolean) => void];
}

export interface ActionItem extends BaseItem {
  kind: 'action';
  badge?: RowBadge;
  run: () => void;
}

export type SettingsItem = ChoiceItem | ToggleItem | ActionItem;

/** What menus accept: items plus falsy entries from inline `cond && item`. */
export type SettingsEntry = SettingsItem | false | null | undefined;

/** Declare a one-of-N setting. Typed on its value union at the declaration;
 * erased to `string` inside the item because the renderer only ever feeds back
 * values it obtained from `options()`, so the narrowing casts are safe. */
export function choiceItem<T extends string>(
  spec: BaseItem & {
    level: SettingsLevel;
    options: (t: Translate, locale: Locale) => readonly T[];
    valueLabel: (value: T) => MessageKey;
    use: () => readonly [T, (value: T) => void];
    pick?: ChoicePick;
  },
): SettingsItem {
  const { options, valueLabel, use, ...base } = spec;
  return {
    kind: 'choice',
    ...base,
    options,
    valueLabel: (value) => valueLabel(value as T),
    use: () => {
      const [value, set] = use();
      return [value, set as (value: string) => void] as const;
    },
  };
}

export function toggleItem(spec: Omit<ToggleItem, 'kind'>): SettingsItem {
  return { kind: 'toggle', ...spec };
}

export function actionItem(spec: Omit<ActionItem, 'kind'>): SettingsItem {
  return { kind: 'action', ...spec };
}
