/** What a key press asks the editor for. */
export type Shortcut = 'save-next' | 'next' | 'previous' | 'insert-variable';

/** The fields of a keyboard event the editor reads. */
export interface KeyPress {
  key: string;
  code: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

const WITH_MODIFIER: Record<string, Shortcut> = {
  Enter: 'save-next',
  ArrowDown: 'next',
  ArrowUp: 'previous',
};

function withAlt(press: KeyPress): Shortcut | null {
  const alone = !press.ctrlKey && !press.metaKey;
  return alone && press.code === 'KeyV' ? 'insert-variable' : null;
}

function withModifier(press: KeyPress): Shortcut | null {
  return press.ctrlKey === press.metaKey ? null : (WITH_MODIFIER[press.key] ?? null);
}

/**
 * The editor's shortcut a key press spells, or null: Ctrl or ⌘ with Enter, ↓
 * or ↑, and Alt+V, read by its physical key because Alt changes the letter a
 * Mac types.
 */
export function shortcutOf(press: KeyPress): Shortcut | null {
  if (press.shiftKey) {
    return null;
  }
  return press.altKey ? withAlt(press) : withModifier(press);
}

/** The item `step` places after `current` in `items`, or null past either end or for an item not listed. */
export function neighbour<T>(items: readonly T[], current: T, step: 1 | -1): T | null {
  const at = items.indexOf(current);
  if (at < 0) {
    return null;
  }
  return items[at + step] ?? null;
}

/** How the shortcut modifier is spelled on the platform `navigator.platform` names. */
export function modifierLabel(platform: string): string {
  return /mac|iphone|ipad/i.test(platform) ? '⌘' : 'Ctrl';
}
