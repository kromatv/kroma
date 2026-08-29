// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { isApplePlatform, isChord, isEditableTarget, letterOf, modifierLabel } from './shortcut';

const chord = (init: KeyboardEventInit) =>
  new KeyboardEvent('keydown', { code: 'KeyK', ctrlKey: true, altKey: true, ...init });

describe('isChord', () => {
  it('matches the physical key so a layout that moves the letter still fires', () => {
    expect(isChord(chord({ key: '˚' }), 'KeyK')).toBe(true);
  });

  it('ignores a chord aimed at another key', () => {
    expect(isChord(chord({}), 'KeyI')).toBe(false);
  });

  it('refuses AltGr, which Windows and Linux report as ctrl+alt', () => {
    const altGr = chord({ modifierAltGraph: true } as KeyboardEventInit);

    expect(isChord(altGr, 'KeyK')).toBe(false);
  });

  it('refuses a key held down so the state does not flip at the repeat rate', () => {
    expect(isChord(chord({ repeat: true }), 'KeyK')).toBe(false);
  });

  it('refuses a richer chord that happens to contain this one', () => {
    expect(isChord(chord({ shiftKey: true }), 'KeyK')).toBe(false);
    expect(isChord(chord({ metaKey: true }), 'KeyK')).toBe(false);
  });

  it('refuses either modifier on its own', () => {
    expect(isChord(chord({ altKey: false }), 'KeyK')).toBe(false);
    expect(isChord(chord({ ctrlKey: false }), 'KeyK')).toBe(false);
  });
});

describe('isEditableTarget', () => {
  it('reports a field the reader could be typing in', () => {
    for (const tag of ['input', 'textarea', 'select']) {
      expect(isEditableTarget(document.createElement(tag))).toBe(true);
    }
  });

  it('reports a contenteditable element, and anything nested inside one', () => {
    const host = document.createElement('div');
    host.setAttribute('contenteditable', 'true');
    const inner = document.createElement('span');
    host.append(inner);
    document.body.append(host);

    expect(isEditableTarget(host)).toBe(true);
    expect(isEditableTarget(inner)).toBe(true);
  });

  it('reports nothing for ordinary content or a missing target', () => {
    expect(isEditableTarget(document.createElement('div'))).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });
});

describe('how a chord is written', () => {
  it('prints a modifier as the symbol a Mac puts on the key', () => {
    expect(modifierLabel('ctrl', true)).toBe('⌃');
    expect(modifierLabel('alt', true)).toBe('⌥');
    expect(modifierLabel('shift', true)).toBe('⇧');
  });

  it('spells it out everywhere else', () => {
    expect(modifierLabel('ctrl', false)).toBe('Ctrl');
    expect(modifierLabel('shift', false)).toBe('Shift');
  });

  it('names the key a code stands for', () => {
    expect(letterOf('KeyK')).toBe('K');
    expect(letterOf('Escape')).toBe('Escape');
  });
});

describe('isApplePlatform', () => {
  it('knows the platforms whose readers expect the symbols', () => {
    expect(isApplePlatform('MacIntel')).toBe(true);
    expect(isApplePlatform('iPhone')).toBe(true);
    expect(isApplePlatform('Win32')).toBe(false);
    expect(isApplePlatform('Linux x86_64')).toBe(false);
  });
});
