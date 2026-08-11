// The story format: one plain object per component describing how to render it
// and what about it is worth changing. A component's `sv` supplies the controls.

import type { VariantSource } from '@kroma/ui/kit';
import type { ComponentType, ReactNode } from 'react';
import type { PropDoc } from './props';

type AnySv = VariantSource;

type Args = Record<string, unknown>;

/** An array is a set of choices; an object is a numeric range. */
type ControlSpec =
  | 'text'
  | 'boolean'
  | 'number'
  | 'icon'
  | readonly string[]
  | { min: number; max: number; step?: number };

type Control =
  | { kind: 'text' }
  | { kind: 'boolean' }
  | { kind: 'number'; min: number; max: number; step: number }
  | { kind: 'select'; options: string[] };

interface ResolvedControl {
  key: string;
  control: Control;
  variant: boolean;
}

interface MatrixRow {
  group: string;
  options: unknown[];
}

/** How much width the canvas gives a story: a fixed width, the whole stage, or
 * the stage clamped. Omit it for a component sized by its own content. */
type StoryWidth = number | 'fill' | { min?: number; max?: number };

/** A `<story>.docs.mdx` compiled to a component. `components` is the element
 * map the workbench hands it (`MDX_COMPONENTS`); MDX types it loosely because
 * every host maps a different set. */
type DocComponent = ComponentType<{ components?: Record<string, unknown> }>;

/** A story's prose: the inline `docs:` string, or the sibling `.docs.mdx` that
 * replaces it. */
type StoryDocs = string | DocComponent;

type Widen<T> = T extends string
  ? string
  : T extends number
    ? number
    : T extends boolean
      ? boolean
      : T;

interface SceneDef<A extends Args> {
  name: string;
  docs?: string;
  render?: (args: A) => ReactNode;
  args?: { [K in keyof A]?: Widen<A[K]> };
}

/** A worked example, written as an ordinary component. Produced by `demos.ts`
 * from the `*.demo.tsx` files beside a component, never authored by hand. */
interface DemoDef {
  name: string;
  docs?: string;
  /** Absent on Metro, which cannot hand a module its own text. */
  code?: string;
  render: () => ReactNode;
}

interface StoryDef<A extends Args> {
  name: string;
  group: string;
  docs?: string;
  variants?: AnySv;
  /** Variant groups to leave out of the derived controls, for a recipe that
   *  belongs to a PART while the story renders the Root: the Root cannot take
   *  them, so a control for one moves nothing and reads as broken. */
  omit?: readonly string[];
  args?: A;
  controls?: { [K in keyof A]?: ControlSpec };
  render: (args: A) => ReactNode;
  scenes?: readonly SceneDef<A>[];
  matrix?: false;
  pad?: number;
  width?: StoryWidth;
  viewport?: 'fit' | 'tv' | 'phone' | 'tablet';
  usage?: string;
  guidelines?: { do?: readonly string[]; dont?: readonly string[] };
}

interface Scene {
  name: string;
  docs?: string;
  render: (args: Args) => ReactNode;
}

/** A story after compilation: everything the workbench needs, nothing it has to
 * derive again at render time. */
interface Story {
  id: string;
  name: string;
  group: string;
  tier: string;
  docs?: StoryDocs;
  args: Args;
  controls: ResolvedControl[];
  matrix: MatrixRow[];
  scenes: Scene[];
  demos: readonly DemoDef[];
  /** Empty on Metro, which cannot hand a module its own text. */
  props: readonly PropDoc[];
  render: (args: Args) => ReactNode;
  pad: number;
  width?: StoryWidth;
  viewport?: 'fit' | 'tv' | 'phone' | 'tablet';
  usage?: string;
  guidelines: { do: readonly string[]; dont: readonly string[] };
}

// A group of these is the `sv` spelling of a boolean prop, so it is surfaced as
// a boolean rather than a dropdown of strings. Usually just `true`: a recipe
// only declares the option that paints something, and off is the base look.
const BOOLEAN_OPTIONS = new Set(['true', 'false']);

function isBooleanGroup(options: readonly string[]): boolean {
  return options.length > 0 && options.every((option) => BOOLEAN_OPTIONS.has(option));
}

function resolveSpec(spec: ControlSpec): Control {
  if (spec === 'text') return { kind: 'text' };
  if (spec === 'boolean') return { kind: 'boolean' };
  if (spec === 'number') return { kind: 'number', min: 0, max: 100, step: 1 };
  // Thousands of Tabler names resolve, so this is a field you type, not a list
  // you step through. An unknown name draws the fallback glyph.
  if (spec === 'icon') return { kind: 'text' };
  if (Array.isArray(spec)) return { kind: 'select', options: [...spec] };
  const range = spec as { min: number; max: number; step?: number };
  return { kind: 'number', min: range.min, max: range.max, step: range.step ?? 1 };
}

function inferSpec(value: unknown): Control | null {
  if (typeof value === 'string') return { kind: 'text' };
  if (typeof value === 'boolean') return { kind: 'boolean' };
  if (typeof value === 'number') return { kind: 'number', min: 0, max: 100, step: 1 };
  return null;
}

function slug(name: string): string {
  return (
    name
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      // Strip diacritics before the alphanumeric filter: "Icônes" must
      // deep-link as ?story=icones, not ?story=ic-nes.
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
  );
}

// `const A`: without it `args: { icon: 'volume' }` infers `string` and every
// story feeding a union-typed prop stops compiling.
function story<const A extends Args = Record<string, never>>(def: StoryDef<A>): Story {
  const args: Args = { ...def.args };
  const controls: ResolvedControl[] = [];
  const matrix: MatrixRow[] = [];

  const omitted = new Set(def.omit ?? []);
  for (const [group, raw] of Object.entries(def.variants?.options ?? {})) {
    if (omitted.has(group)) continue;
    const options = raw.map(String);
    const fallback = def.variants?.defaults?.[group];
    if (isBooleanGroup(options)) {
      controls.push({ key: group, control: { kind: 'boolean' }, variant: true });
      matrix.push({ group, options: [false, true] });
      args[group] ??= String(fallback) === 'true';
    } else {
      controls.push({ key: group, control: { kind: 'select', options }, variant: true });
      matrix.push({ group, options });
      args[group] ??= fallback === undefined ? options[0] : String(fallback);
    }
  }

  for (const [key, value] of Object.entries(def.args ?? {})) {
    // A prop that is also a variant already has its control from the `sv`.
    if (controls.some((existing) => existing.key === key)) continue;
    const spec = def.controls?.[key as keyof A];
    const control = spec ? resolveSpec(spec) : inferSpec(value);
    if (control) controls.push({ key, control, variant: false });
  }

  const scenes: Scene[] = (def.scenes ?? []).map((scene) => ({
    name: scene.name,
    docs: scene.docs,
    render: (current: Args) => {
      const merged = { ...current, ...scene.args } as unknown as A;
      return (scene.render ?? def.render)(merged);
    },
  }));

  return {
    id: slug(def.name),
    name: def.name,
    group: def.group,
    // Overwritten by the registry, the only thing that knows the file path.
    tier: 'Other',
    docs: def.docs,
    args,
    controls,
    matrix: def.matrix === false ? [] : matrix,
    scenes,
    demos: [],
    props: [],
    render: (current: Args) => def.render(current as unknown as A),
    pad: def.pad ?? 0,
    width: def.width,
    viewport: def.viewport,
    usage: def.usage,
    guidelines: { do: def.guidelines?.do ?? [], dont: def.guidelines?.dont ?? [] },
  };
}

/** Case-insensitive match on the story's name, group or atomic level. */
function matches(story: Story, query: string): boolean {
  if (!query) return true;
  const needle = query.toLowerCase();
  return (
    story.name.toLowerCase().includes(needle) ||
    story.group.toLowerCase().includes(needle) ||
    (story.tier ?? '').toLowerCase().includes(needle)
  );
}

/** Sidebar order; any group not listed follows alphabetically. One flat list
 * of FUNCTIONAL groups: what a component is for, never which atomic level it
 * happens to live at - the levels are for the people editing the kit, and a
 * tree that nested them made every kind of input land in three places. */
const GROUP_ORDER = [
  'Foundations',
  'Layout',
  'Actions',
  'Input',
  'Overlays',
  'Feedback',
  'Media',
  'Player',
  'Brand',
];

const TIER_ORDER = ['Foundations', 'Atoms', 'Molecules', 'Organisms', 'Templates'];

/** Which atomic level a story belongs to, read from where its file sits. */
function tierFor(path: string): string {
  const at = /\/components\/(atoms|molecules|organisms|templates)\//.exec(path);
  if (at?.[1]) return `${at[1].charAt(0).toUpperCase()}${at[1].slice(1)}`;
  if (path.includes('/foundations/')) return 'Foundations';
  return 'Other';
}

/** The distinct values of `key` with the items that carry them, in encounter
 * order — which, after `orderStories`, is already the sorted order. */
function groupBy<T, K>(items: readonly T[], key: (item: T) => K): { key: K; items: T[] }[] {
  const out = new Map<K, T[]>();
  for (const item of items) {
    const at = key(item);
    const bucket = out.get(at);
    if (bucket) bucket.push(item);
    else out.set(at, [item]);
  }
  return [...out].map(([at, entries]) => ({ key: at, items: entries }));
}

/** Attach the level each story's file implies. */
function attachTiers(stories: readonly Story[], paths: readonly string[]): Story[] {
  return stories.map((entry, at) => ({ ...entry, tier: tierFor(paths[at] ?? '') }));
}

/** Sorts the registry for display: by functional group, then name. The atomic
 * level stays attached (search matches it, the palette shows it) but never
 * drives the order a reader scans. */
function orderStories(stories: readonly Story[]): Story[] {
  const rankOf = (order: readonly string[], value: string) => {
    const at = order.indexOf(value);
    return at === -1 ? order.length : at;
  };
  return [...stories].sort(
    (a, b) =>
      rankOf(GROUP_ORDER, a.group) - rankOf(GROUP_ORDER, b.group) ||
      a.group.localeCompare(b.group) ||
      a.name.localeCompare(b.name),
  );
}

export type {
  Control,
  ControlSpec,
  DemoDef,
  DocComponent,
  MatrixRow,
  ResolvedControl,
  Scene,
  Story,
  StoryDef,
  StoryDocs,
  StoryWidth,
};
export {
  attachTiers,
  GROUP_ORDER,
  groupBy,
  isBooleanGroup,
  matches,
  orderStories,
  slug,
  story,
  TIER_ORDER,
  tierFor,
};
