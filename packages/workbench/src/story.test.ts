// The story format, tested as the pure data transformation it is.
//
// The interesting claim is that a component's `sv` alone is enough to build its
// controls and its matrix. These tests hold that: declare variants, get the
// panel and the grid, with nothing else written down.

import { sv } from '@kroma/ui/kit';
import { describe, expect, it } from 'vitest';
import { GROUP_ORDER, orderStories, type Story, slug, story, TIER_ORDER, tierFor } from './story';

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

describe('story()', () => {
  const built = story({
    name: 'Poster card',
    group: 'Media',
    variants,
    args: { label: 'Dune', count: 3, muted: true, onPress: () => {} },
    render: () => null,
  });

  it('slugs the name into a stable id', () => {
    expect(built.id).toBe('poster-card');
    expect(slug('ProgressRing')).toBe('progress-ring');
    expect(slug('Icônes')).toBe('icones');
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
});

describe('scenes and matrix opt-out', () => {
  const built = story({
    name: 'Empty state',
    group: 'State',
    variants,
    matrix: false,
    args: { title: 'Nothing' },
    render: (args) => `render:${args.title}` as unknown as null,
    scenes: [{ name: 'With action', args: { title: 'Scene' } }],
  });

  it('drops the matrix when asked', () => {
    expect(built.matrix).toEqual([]);
    // The controls survive: only the grid was suppressed.
    expect(built.controls.length).toBeGreaterThan(0);
  });

  it('merges a scene args over the live ones', () => {
    expect(built.scenes[0]?.render({ title: 'Live' })).toBe('render:Scene');
  });
});

describe('tierFor', () => {
  it('reads the atomic level out of the file path, because the folder IS the claim', () => {
    expect(tierFor('../components/atoms/button/button.stories.tsx')).toBe('Atoms');
    expect(tierFor('../components/molecules/field/field.stories.tsx')).toBe('Molecules');
    expect(tierFor('../components/organisms/rail/rail.stories.tsx')).toBe('Organisms');
    expect(tierFor('../components/templates/tv-stage/tv-stage.stories.tsx')).toBe('Templates');
    expect(tierFor('./foundations/colors.stories.tsx')).toBe('Foundations');
  });

  it('names an unplaced story rather than guessing at it', () => {
    expect(tierFor('../somewhere/else.stories.tsx')).toBe('Other');
  });

  it('lists the levels in the order the design system builds them up', () => {
    expect(TIER_ORDER.slice(0, 5)).toEqual([
      'Foundations',
      'Atoms',
      'Molecules',
      'Organisms',
      'Templates',
    ]);
  });
});

describe('orderStories', () => {
  const make = (tier: string, group: string, name: string) =>
    ({ id: slug(name), tier, group, name }) as Story;

  it('sorts by atomic level first, so the sidebar reads as the hierarchy', () => {
    const sorted = orderStories([
      make('Organisms', 'Media', 'Rail'),
      make('Atoms', 'Actions', 'Button'),
      make('Templates', 'Layout', 'TvStage'),
      make('Foundations', 'Foundations', 'Colors'),
      make('Molecules', 'Input', 'Field'),
    ]);
    expect(sorted.map((s) => s.name)).toEqual(['Colors', 'Button', 'Field', 'Rail', 'TvStage']);
  });

  it('falls back to the design grouping, then the name, within one level', () => {
    const sorted = orderStories([
      make('Atoms', 'Brand', 'Wheel'),
      make('Atoms', 'Actions', 'Chip'),
      make('Atoms', 'Actions', 'Button'),
    ]);
    expect(sorted.map((s) => s.name)).toEqual(['Button', 'Chip', 'Wheel']);
    expect(GROUP_ORDER).toContain('Brand');
  });

  it('puts an unlisted level last instead of silently dropping it', () => {
    const sorted = orderStories([
      make('Zzz unknown', 'Media', 'Thing'),
      make('Atoms', 'Brand', 'Logo'),
    ]);
    expect(sorted.map((s) => s.tier)).toEqual(['Atoms', 'Zzz unknown']);
  });

  it('sorts a story whose tier was never attached instead of crashing', () => {
    const orphan = { id: 'orphan', group: 'Media', name: 'Orphan' } as Story;
    expect(() => orderStories([orphan, make('Atoms', 'Actions', 'Button')])).not.toThrow();
  });
});
