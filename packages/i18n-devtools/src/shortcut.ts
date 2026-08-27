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

export function chordLabel(code: string, apple: boolean): string {
  const key = code.replace(/^Key/, '');
  return apple ? `⌃⌥${key}` : `Ctrl+Alt+${key}`;
}
