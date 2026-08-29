export interface Shortcut {
  code: string;
  run: () => void;
}

const EDITABLE = /^(?:INPUT|TEXTAREA|SELECT)$/;
const APPLE = /mac|iphone|ipad|ipod/i;

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (EDITABLE.test(target.tagName)) return true;
  return target.isContentEditable === true || target.closest('[contenteditable="true"]') !== null;
}

export function isChord(event: KeyboardEvent, code: string): boolean {
  if (event.repeat || event.metaKey || event.shiftKey) return false;
  if (!event.ctrlKey || !event.altKey) return false;
  // Windows and Linux report AltGr as ctrl+alt, so every AltGr character on a
  // Swiss, German or French layout would otherwise land here as a chord.
  if (event.getModifierState('AltGraph')) return false;
  return event.code === code;
}

export function isApplePlatform(platform: string): boolean {
  return APPLE.test(platform);
}

/** A key held down rather than pressed. */
export type Modifier = 'ctrl' | 'alt' | 'shift';

const PRINTED: Record<Modifier, string> = { ctrl: '⌃', alt: '⌥', shift: '⇧' };
const SPELLED: Record<Modifier, string> = { ctrl: 'Ctrl', alt: 'Alt', shift: 'Shift' };

/** How a modifier is drawn here: the symbol a Mac prints on the key, the word
 *  everywhere else. */
export function modifierLabel(modifier: Modifier, apple: boolean): string {
  return apple ? PRINTED[modifier] : SPELLED[modifier];
}

/** The key a code names, as it is printed on it. */
export function letterOf(code: string): string {
  return code.replace(/^Key/, '');
}
