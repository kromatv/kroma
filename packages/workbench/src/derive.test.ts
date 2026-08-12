import { sv } from '@kroma/ui/kit';
import { describe, expect, it } from 'vitest';
import { story } from './story';

const variants = sv({
  slots: { root: { borderRadius: 4 } },
  variants: {
    variant: { primary: {}, ghost: {} },
    size: { sm: {}, lg: {} },
    block: { true: {}, false: {} },
  },
  defaults: { variant: 'ghost', size: 'lg', block: 'false' },
});

describe('sv introspection', () => {
  it('carries its own declaration', () => {
    expect(variants.options).toEqual({
      variant: ['primary', 'ghost'],
      size: ['sm', 'lg'],
      block: ['true', 'false'],
    });
    expect(variants.defaults).toEqual({ variant: 'ghost', size: 'lg', block: 'false' });
    expect(variants.slots).toEqual(['root']);
  });

  it('still resolves styles', () => {
    expect(variants({ variant: 'primary' }).root).toEqual({ borderRadius: 4 });
  });
});

describe('controls derived from a component’s variants', () => {
  const built = story({
    name: 'Poster card',
    group: 'Media',
    variants,
    args: { label: 'Dune', count: 3, muted: true, onPress: () => {} },
    render: () => null,
  });

  it('leaves out a variant group the story cannot drive, control and matrix row alike', () => {
    const partial = story({
      name: 'Partial',
      group: 'Media',
      variants,
      omit: ['size'],
      render: () => null,
    });
    const keys = partial.controls.map((c) => c.key);

    expect(keys).toContain('variant');
    expect(keys).not.toContain('size');
    expect(partial.matrix.map((row) => row.group)).not.toContain('size');
    expect(partial.args).not.toHaveProperty('size');
  });

  it('derives a control per variant group, variants first', () => {
    const keys = built.controls.map((control) => control.key);
    expect(keys.slice(0, 3)).toEqual(['variant', 'size', 'block']);
    expect(built.controls.filter((control) => control.variant)).toHaveLength(3);
  });

  it('reads a true/false group as a real boolean rather than two strings', () => {
    const block = built.controls.find((control) => control.key === 'block');
    expect(block?.control).toEqual({ kind: 'boolean' });
    expect(built.args.block).toBe(false);
    expect(built.matrix.find((row) => row.group === 'block')?.options).toEqual([false, true]);
  });

  it('reads a group that only declares `true` as a boolean too: off is the base look', () => {
    const lone = sv({ base: {}, variants: { open: { true: { opacity: 0.5 } } } });
    const s = story({ name: 'Lone', group: 'Media', variants: lone, render: () => null });
    expect(s.controls.find((control) => control.key === 'open')?.control).toEqual({
      kind: 'boolean',
    });
    expect(s.matrix.find((row) => row.group === 'open')?.options).toEqual([false, true]);
    expect(s.args.open).toBe(false);
  });

  it('seeds args from the variant defaults', () => {
    expect(built.args.variant).toBe('ghost');
    expect(built.args.size).toBe('lg');
  });

  it('infers a control from each arg value', () => {
    const byKey = Object.fromEntries(built.controls.map((c) => [c.key, c.control]));
    expect(byKey.label).toEqual({ kind: 'text' });
    expect(byKey.muted).toEqual({ kind: 'boolean' });
    expect(byKey.count).toEqual({ kind: 'number', min: 0, max: 100, step: 1 });
  });

  it('gives a prop with no editable shape no control, but still passes it through', () => {
    expect(built.controls.some((control) => control.key === 'onPress')).toBe(false);
    expect(built.args.onPress).toBeTypeOf('function');
  });

  it('builds one matrix row per variant group', () => {
    expect(built.matrix.map((row) => row.group)).toEqual(['variant', 'size', 'block']);
    expect(built.matrix[0]?.options).toEqual(['primary', 'ghost']);
  });
});

describe('explicit controls', () => {
  it('overrides inference', () => {
    const built = story({
      name: 'Progress',
      group: 'State',
      args: { value: 0.4, tone: 'info', icon: 'search' },
      controls: {
        value: { min: 0, max: 1, step: 0.05 },
        tone: ['info', 'danger'],
        icon: 'icon',
      },
      render: () => null,
    });
    const byKey = Object.fromEntries(built.controls.map((c) => [c.key, c.control]));
    expect(byKey.value).toEqual({ kind: 'number', min: 0, max: 1, step: 0.05 });
    expect(byKey.tone).toEqual({ kind: 'select', options: ['info', 'danger'] });
    // An icon control is a field you TYPE, not a list you step through: every
    // Tabler name resolves now (thousands of them), and an unknown one draws the
    // fallback glyph rather than failing. See resolveSpec.
    expect(byKey.icon).toEqual({ kind: 'text' });
  });

  it('takes each named kind, and gives a range with no step one of 1', () => {
    const built = story({
      name: 'Named kinds',
      group: 'State',
      args: { label: 'x', open: false, weight: 2 },
      controls: { label: 'text', open: 'boolean', weight: { min: 1, max: 5 } },
      render: () => null,
    });
    const byKey = Object.fromEntries(built.controls.map((c) => [c.key, c.control]));
    expect(byKey.label).toEqual({ kind: 'text' });
    expect(byKey.open).toEqual({ kind: 'boolean' });
    expect(byKey.weight).toEqual({ kind: 'number', min: 1, max: 5, step: 1 });
  });

  it('reads a number spec that spells no bounds as the default 0-100 slider', () => {
    const built = story({
      name: 'Bare number',
      group: 'State',
      args: { count: 3 },
      controls: { count: 'number' },
      render: () => null,
    });
    expect(built.controls[0]?.control).toEqual({ kind: 'number', min: 0, max: 100, step: 1 });
  });
});

describe('a variant group with no declared default', () => {
  const lone = sv({ base: {}, variants: { tone: { calm: {}, loud: {} } } });

  it('seeds the arg from the first option, so the story renders as declared', () => {
    const built = story({ name: 'Toneless', group: 'Media', variants: lone, render: () => null });
    expect(built.args.tone).toBe('calm');
  });

  it('lets an explicit arg win, and does not add a second control for it', () => {
    const built = story({
      name: 'Toneful',
      group: 'Media',
      variants: lone,
      args: { tone: 'loud' },
      render: () => null,
    });
    expect(built.args.tone).toBe('loud');
    expect(built.controls.filter((control) => control.key === 'tone')).toHaveLength(1);
    expect(built.controls[0]?.variant).toBe(true);
  });
});
