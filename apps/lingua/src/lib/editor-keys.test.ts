import { describe, expect, it } from 'vitest';
import { type KeyPress, keyLabels, neighbour, shortcutOf } from './editor-keys';

function press(key: string, over: Partial<KeyPress> = {}): KeyPress {
  return { key, code: '', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...over };
}

describe('shortcutOf', () => {
  it('reads Ctrl or ⌘ with Enter, ↓ and ↑', () => {
    expect(shortcutOf(press('Enter', { ctrlKey: true }))).toBe('save-next');
    expect(shortcutOf(press('Enter', { metaKey: true }))).toBe('save-next');
    expect(shortcutOf(press('ArrowDown', { ctrlKey: true }))).toBe('next');
    expect(shortcutOf(press('ArrowUp', { metaKey: true }))).toBe('previous');
  });

  it('reads Alt+V by its key, whatever letter the layout types', () => {
    expect(shortcutOf(press('√', { altKey: true, code: 'KeyV' }))).toBe('insert-variable');
    expect(shortcutOf(press('b', { altKey: true, code: 'KeyB' }))).toBeNull();
  });

  it('leaves plain keys, Shift, both modifiers at once, and other keys to the field', () => {
    expect(shortcutOf(press('Enter'))).toBeNull();
    expect(shortcutOf(press('Enter', { ctrlKey: true, shiftKey: true }))).toBeNull();
    expect(shortcutOf(press('Enter', { ctrlKey: true, metaKey: true }))).toBeNull();
    expect(shortcutOf(press('ArrowDown', { ctrlKey: true, altKey: true }))).toBeNull();
    expect(shortcutOf(press('s', { ctrlKey: true }))).toBeNull();
  });
});

describe('neighbour', () => {
  const fields = ['a', 'b', 'c'];

  it('steps forward and back through the list', () => {
    expect([neighbour(fields, 'b', 1), neighbour(fields, 'b', -1)]).toEqual(['c', 'a']);
  });

  it('stops at either end, and for an item not in the list', () => {
    expect([
      neighbour(fields, 'c', 1),
      neighbour(fields, 'a', -1),
      neighbour(fields, 'z', 1),
    ]).toEqual([null, null, null]);
  });
});

describe('keyLabels', () => {
  it('prints ⌘ and ⌥ on Apple platforms, Ctrl and Alt elsewhere', () => {
    expect(['MacIntel', 'iPhone', 'Win32', 'Linux x86_64'].map(keyLabels)).toEqual([
      { modifier: '⌘', option: '⌥' },
      { modifier: '⌘', option: '⌥' },
      { modifier: 'Ctrl', option: 'Alt' },
      { modifier: 'Ctrl', option: 'Alt' },
    ]);
  });
});
