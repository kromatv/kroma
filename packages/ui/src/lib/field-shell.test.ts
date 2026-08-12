import { afterEach, describe, expect, it } from 'vitest';
import {
  bySize,
  CONTROL,
  controlMetrics,
  controlRadius,
  edgeColor,
  entryDefaultPhysicalKeyboard,
  entryDefaultSize,
  fieldShell,
  setEntryDefaults,
} from './field-shell';

afterEach(() => setEntryDefaults({ physicalKeyboard: false, size: 'md' }));

describe('the shell defaults', () => {
  it('starts at the size a phone in the hand wants', () => {
    expect(entryDefaultSize()).toBe('md');
    expect(entryDefaultPhysicalKeyboard()).toBe(false);
  });

  it('takes each default on its own, leaving the one it was not given', () => {
    setEntryDefaults({ size: 'sm' });
    expect(entryDefaultSize()).toBe('sm');
    expect(entryDefaultPhysicalKeyboard()).toBe(false);

    setEntryDefaults({ physicalKeyboard: true });
    expect(entryDefaultPhysicalKeyboard()).toBe(true);
    expect(entryDefaultSize()).toBe('sm');

    setEntryDefaults({});
    expect(entryDefaultSize()).toBe('sm');
    expect(entryDefaultPhysicalKeyboard()).toBe(true);
  });

  it('falls back to the shell size, and lets a caller state its own', () => {
    setEntryDefaults({ size: 'tv' });
    expect(controlMetrics()).toBe(CONTROL.tv);
    expect(controlMetrics('sm')).toBe(CONTROL.sm);
  });
});

describe('the control table', () => {
  it('derives every height from its own border, padding and line', () => {
    for (const metrics of Object.values(CONTROL)) {
      expect(metrics.height).toBe(2 + metrics.py * 2 + metrics.line);
    }
  });

  it('builds one entry per size from the table rather than a transcription', () => {
    const built = bySize((metrics) => metrics.px);
    expect(built).toEqual({ sm: CONTROL.sm.px, md: CONTROL.md.px, tv: CONTROL.tv.px });
  });

  it('resolves a corner against the active theme rather than at module load', () => {
    expect(controlRadius(CONTROL.sm)).toBeGreaterThan(0);
    expect(controlRadius(CONTROL.tv)).toBeGreaterThan(controlRadius(CONTROL.sm));
  });
});

describe('fieldShell', () => {
  it('drops fill, corner and edge when the shell belongs to something else', () => {
    const flat = fieldShell(CONTROL.md, { flat: true, focused: true, invalid: true });
    expect(flat.box).toEqual({ radius: 0, bg: 'transparent', borderWidth: 0 });
    expect(flat.edge).toBeNull();
  });

  it('draws its own well when it owns the shell, and lifts only when asked', () => {
    const plain = fieldShell(CONTROL.md, { flat: false, focused: false, invalid: false });
    expect(plain.box).toMatchObject({ radius: CONTROL.md.radius, bg: CONTROL.md.bg });
    expect(plain.box).not.toHaveProperty('shadow');

    const lifted = fieldShell(CONTROL.md, {
      flat: false,
      focused: false,
      invalid: false,
      lift: true,
    });
    expect(lifted.box).toHaveProperty('shadow', 'card');
  });

  it('adds the kit ring on focus, and only then', () => {
    const resting = fieldShell(CONTROL.md, { flat: false, focused: false, invalid: false });
    const focused = fieldShell(CONTROL.md, { flat: false, focused: true, invalid: false });
    expect(Object.keys(focused.edge ?? {}).length).toBeGreaterThan(
      Object.keys(resting.edge ?? {}).length,
    );
  });

  it('recolours the edge for invalid, which focus alone does not', () => {
    const invalid = fieldShell(CONTROL.md, { flat: false, focused: false, invalid: true });
    const focused = fieldShell(CONTROL.md, { flat: false, focused: true, invalid: false });
    expect(invalid.edge?.borderColor).toBe(edgeColor(false, true));
    expect(focused.edge?.borderColor).toBe(edgeColor(false, false));
    expect(invalid.edge?.borderColor).not.toBe(focused.edge?.borderColor);
  });
});
