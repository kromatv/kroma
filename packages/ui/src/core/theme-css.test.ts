import { describe, expect, it } from 'vitest';
import { color } from './color';
import { createTheme, KROMA, themeVersion } from './theme';
import { applyMode } from './theme-mode';

describe('the palette on a browser target', () => {
  it('resolves a token to its custom property', () => {
    expect(KROMA.colors.accent).toBe('var(--kroma-accent)');
    expect(KROMA.colors.surface1).toBe('var(--kroma-surface-1)');
    expect(KROMA.colors.textMuted).toBe('var(--kroma-text-muted)');
  });

  it('resolves an alpha step to the property the build emits for it', () => {
    expect(color('text/85')).toBe('var(--kroma-text-85)');
    expect(color('tint/2.5')).toBe('var(--kroma-tint-2_5)');
  });

  it('keeps a palette-independent colour literal', () => {
    expect(color('white/8')).toBe('rgba(255, 255, 255, 0.08)');
    expect(color('#F4B642')).toBe('#F4B642');
    expect(color('transparent')).toBe('transparent');
  });

  it('carries the properties into everything derived from them', () => {
    expect(KROMA.shadow.card).toBe('var(--shadow-card)');
    expect(KROMA.ring.focus.outlineColor).toBe('var(--kroma-accent)');
    expect(KROMA.glow.accent).toContain('var(--kroma-accent-wash-40)');
    expect(KROMA.ring.focusWash.outlineColor).toBe('var(--kroma-accent-wash-28)');
  });

  it('switches ground without touching the store, so nothing re-resolves', () => {
    const before = themeVersion();
    applyMode('light');
    applyMode('dark');
    expect(themeVersion()).toBe(before);
  });

  it('leaves an overridden token literal, since the cascade knows nothing of it', () => {
    const branded = createTheme({ colors: { accent: '#FF0000' } });
    expect(branded.colors.accent).toBe('#FF0000');
    expect(branded.ring.focus.outlineColor).toBe('#FF0000');
    expect(branded.colors.bg).toBe('var(--kroma-bg)');
  });
});
