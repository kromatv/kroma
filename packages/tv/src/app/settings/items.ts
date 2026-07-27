// The declarative settings model. A settings menu is a plain LIST of items;
// each item is declared once (identity, level, binding, presentation) and
// <SettingsRows> renders it. Three kinds cover every row:
//
//  - choice : cycles through the currently-offerable values on OK. The row
//             hides itself when there is no real choice (fewer than two).
//  - toggle : boolean on/off with a colored badge.
//  - action : fires a handler (quit, sign out, navigate...), optional badge.
//
// Conditionality is declarative, never a JSX ternary: an item carries its own
// platform gate (`available`), a choice hides itself via `options()`, and a
// screen-local condition is just `cond && item` in the list (falsy entries are
// skipped). `level` names WHERE a value lives, keeping persistence honest:
//
//  - device  : localStorage on this device (settings/store.ts)
//  - shell   : the hosting desktop shell's config file, applied at boot
//  - account : synced to the signed-in account by the server

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
  /** Stable identity: the React key and the test hook. */
  id: string;
  icon: RowIcon;
  label: MessageKey;
  /** Platform gate; the row is skipped entirely when false. Default: shown. */
  available?: () => boolean;
}

/**
 * How a choice is made.
 *
 * `cycle` is the row itself: OK steps to the next value, which is the whole
 * control for the four-answer settings this app grew up with. `list` opens a
 * dialog instead, and exists because one of them stopped being short - the
 * preferred audio language offers every language there is, and cycling to
 * Swedish through a hundred and forty presses is not a control. Roughly: past a
 * screenful, ask for a list.
 */
export type ChoicePick = 'cycle' | 'list';

export interface ChoiceItem extends BaseItem {
  kind: 'choice';
  level: SettingsLevel;
  /** The values offerable RIGHT NOW, in cycle (or list) order. Handed the
   *  active translator and locale so an item that sorts its options by their
   *  NAME can - which alphabetical is, and alphabetical by code is not. */
  options: (t: Translate, locale: Locale) => readonly string[];
  valueLabel: (value: string) => MessageKey;
  /** Reactive binding - a hook, called by the row component. */
  use: () => readonly [string, (value: string) => void];
  /** Defaults to `cycle`. */
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

/** Declare an on/off setting. */
export function toggleItem(spec: Omit<ToggleItem, 'kind'>): SettingsItem {
  return { kind: 'toggle', ...spec };
}

/** Declare an action row. */
export function actionItem(spec: Omit<ActionItem, 'kind'>): SettingsItem {
  return { kind: 'action', ...spec };
}
