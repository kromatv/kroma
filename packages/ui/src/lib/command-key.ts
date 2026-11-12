import { useEffect, useEffectEvent } from 'react';
import { webDocument, webWindow } from './dom';

const APPLE = /Mac|iPhone|iPad|iPod/;
const LATIN_LETTER = /^[a-z]$/i;

type CommandKeyPress = Pick<
  KeyboardEvent,
  'key' | 'code' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'isComposing'
>;

/** Whether this machine's keyboard has a Command key. */
function onAppleHardware(): boolean {
  return APPLE.test(webWindow()?.navigator?.userAgent ?? '');
}

/** The chord that opens a palette as this machine's keyboard prints it, for a label
 *  that cannot draw <CommandKeys />. */
function commandKeyLabel(apple = onAppleHardware()): string {
  return apple ? '⌘K' : 'Ctrl+K';
}

/**
 * Whether a press is the chord that opens a palette: Command+K on Apple hardware,
 * Ctrl+K on Windows and Linux. The letter is read by what the layout types, so a
 * Dvorak K works, and falls back to the physical key on a layout with no Latin
 * letters. AltGr reports as Ctrl+Alt, so it never counts.
 */
function isCommandKey(press: CommandKeyPress, apple = onAppleHardware()): boolean {
  if (press.altKey || press.shiftKey || press.isComposing) return false;
  const modified = apple ? press.metaKey && !press.ctrlKey : press.ctrlKey && !press.metaKey;
  if (!modified) return false;
  return LATIN_LETTER.test(press.key) ? press.key.toLowerCase() === 'k' : press.code === 'KeyK';
}

/**
 * Calls `onPress` on the chord, wherever the focus is, and keeps it from the
 * browser while `enabled`. A held chord fires once. Nothing to bind on a target
 * with no document.
 */
function useCommandKey(onPress: () => void, enabled = true): void {
  const onKey = useEffectEvent((event: KeyboardEvent) => {
    if (!isCommandKey(event)) return;
    event.preventDefault();
    event.stopPropagation();
    if (!event.repeat) onPress();
  });

  useEffect(() => {
    const document = webDocument();
    if (!document || !enabled) return;
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [enabled]);
}

export { commandKeyLabel, isCommandKey, onAppleHardware, useCommandKey };
