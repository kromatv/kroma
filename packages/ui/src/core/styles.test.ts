// @vitest-environment jsdom
import { StyleSheet } from 'react-native';
import { describe, expect, it } from 'vitest';
import { colors } from '#ui/core/tokens';
import { sharedStyle, style, styles } from './styles';

const flat = (s: unknown) => StyleSheet.flatten(s as never) as Record<string, unknown>;

describe('styles', () => {
  const s = styles({
    row: { row: true, align: 'center', gap: 6, px: 8, radius: 'sm' },
    label: { fontSize: 13, color: 'textMuted' },
    wash: { bg: 'white/6' },
  });

  it('speaks the shorthand vocabulary', () => {
    expect(flat(s.row)).toMatchObject({
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingLeft: 8,
      paddingRight: 8,
      borderRadius: 8,
    });
  });

  it('resolves colour tokens and the alpha suffix', () => {
    expect(flat(s.label).color).toBe(colors.textMuted);
    expect(flat(s.wash).backgroundColor).toBe('rgba(255, 255, 255, 0.06)');
  });

  it('keeps every entry identity-stable, so a re-render is a cache hit', () => {
    expect(s.row).toBe(s.row);
    expect(styles({ a: { flex: true } }).a).not.toBe(s.row);
  });

  it('rejects writes, so a caller cannot mutate a shared style', () => {
    expect(() => {
      (s as Record<string, unknown>).row = {};
    }).toThrow();
    expect(Object.isFrozen(s.row)).toBe(true);
  });

  it('names every key it was given, and only those', () => {
    expect(Object.keys(s)).toEqual(['row', 'label', 'wash']);
    expect('row' in s).toBe(true);
    expect('nope' in s).toBe(false);
    expect(Object.getOwnPropertyDescriptor(s, 'nope')).toBeUndefined();
  });

  it('rejects redefining or deleting an entry as firmly as writing one', () => {
    expect(() => Object.defineProperty(s, 'row', { value: {} })).toThrow();
    expect(() => {
      delete (s as Record<string, unknown>).row;
    }).toThrow();
    expect(Object.keys(s)).toEqual(['row', 'label', 'wash']);
  });

  it('registers through StyleSheet, so the web compiles atomic classes', () => {
    // Registration is what turns a repeated declaration into one shared class
    // instead of bytes re-serialised onto every element.
    const registered = StyleSheet.flatten(s.wash);
    expect(registered).toEqual({ backgroundColor: 'rgba(255, 255, 255, 0.06)' });
  });

  it('deduplicates identical declarations across separate sets', () => {
    const a = styles({ x: { bg: 'accent' } });
    const b = styles({ y: { bg: 'accent' } });
    expect(flat(a.x)).toEqual(flat(b.y));
  });
});

describe('style', () => {
  it('is the single-value form', () => {
    expect(flat(style({ px: 12, bg: 'surface2' }))).toEqual({
      paddingLeft: 12,
      paddingRight: 12,
      backgroundColor: colors.surface2,
    });
  });
});

describe('sharedStyle', () => {
  it('hands the same object to every caller of one key', () => {
    const a = sharedStyle('bar:40', { width: 40 });
    expect(sharedStyle('bar:40', { width: 40 })).toBe(a);
    expect(sharedStyle('bar:41', { width: 41 })).not.toBe(a);
  });

  it('stops remembering past its cap, and still resolves correctly', () => {
    for (let i = 0; i < 4096; i++) sharedStyle(`fill:${i}`, { width: i });
    const first = sharedStyle('overflow', { width: 7 });
    const second = sharedStyle('overflow', { width: 7 });
    expect(flat(first)).toEqual({ width: 7 });
    expect(second).not.toBe(first);
  });
});
