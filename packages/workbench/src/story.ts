// The story format.
//
// A story is a plain object describing how to render one component and what
// about it is worth changing. It is deliberately smaller than Storybook's CSF:
// there is no meta/export-per-variation split, no decorators, no parameters, no
// addon protocol. One default export per component, next to the component.
//
// What replaces the missing machinery is `sv`. A component's variant map is
// already the single source of truth for its design, so passing it to a story
// gives the workbench the controls AND the variant matrix with nothing written
// by hand. Storybook needs argTypes or a docgen pass to get there, and both can
// drift from the component; this cannot, because it IS the component.
//
//   export default story({
//     name: 'Button',
//     group: 'Actions',
//     variants: buttonVariants,
//     args: { label: 'Play' },
//     render: (props) => <Button {...props} />,
//   });

import type { VariantSource } from '@kroma/ui/kit';
import type { ReactNode } from 'react';
import type { PropDoc } from './props';

/** Any compiled `sv` — flat or slotted — with its declaration erased. Stories
 * are collected into one heterogeneous list, so the registry cannot carry each
 * component's variant types; authoring stays typed through `story()` below. */
type AnySv = VariantSource;

type Args = Record<string, unknown>;

/** How a prop is written at a call site, in the shorthand a story author uses.
 * An array is a set of choices; an object is a numeric range. */
type ControlSpec =
  | 'text'
  | 'boolean'
  | 'number'
  | 'icon'
  | readonly string[]
  | { min: number; max: number; step?: number };

/** A control, resolved into the one shape the panel renders. */
type Control =
  | { kind: 'text' }
  | { kind: 'boolean' }
  | { kind: 'number'; min: number; max: number; step: number }
  | { kind: 'select'; options: string[] };

interface ResolvedControl {
  key: string;
  control: Control;
  /** True when this came from the component's own `sv` rather than from `args`.
   * The panel groups them separately: variants are the design's axes, plain
   * props are the content you feed it. */
  variant: boolean;
}

/** One row of the derived matrix: a variant group and every option in it. */
interface MatrixRow {
  group: string;
  options: unknown[];
}

/**
 * How much width the canvas gives a story.
 *
 * Absent is the default and covers most of the kit: a button is as wide as its
 * label, and the canvas measures it. The other three forms are for a component
 * that measures ITSELF and therefore has to be told:
 *
 *   340                 a fixed authored width. Honest for something that really
 *                       is one size (a dialog panel, a card at its design width),
 *                       and the wrong tool for anything responsive.
 *   'fill'              whatever the stage has, and it changes with the window.
 *                       This is what a rail gets in a real app.
 *   { min, max }        the same, clamped. `max` keeps a 10-foot row from
 *                       stretching to a 4K desk; `min` keeps a grid from being
 *                       measured at a width no screen has, and the stage scrolls
 *                       sideways rather than going under it.
 *
 * A range beats a number for anything responsive, because the bug a fixed width
 * hides is the one that only appears at another width.
 */
type StoryWidth = number | 'fill' | { min?: number; max?: number };

/** `const A` pins every default to its literal type, which is what makes a typo
 * in an icon name a compile error. A scene that overrides one of those defaults
 * would then be limited to the SAME literal, which is useless, so scene args are
 * widened back to the underlying primitive. */
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
  /** Omit to render the story's own `render` with `args` merged over the
   * defaults, which covers most scenes. */
  render?: (args: A) => ReactNode;
  args?: { [K in keyof A]?: Widen<A[K]> };
}

/**
 * A DEMO: a worked example, written as an ordinary component.
 *
 * A scene is the same component under different args, which is why a scene is
 * one line. A demo is the other half of the job: a form that validates, a
 * dialog that opens, a rail that loads more as it scrolls - things that need
 * their own state, several components and real code. Because a demo is just a
 * component, there is nothing to learn and no ceiling on what it can show.
 *
 * A demo is ONE FILE and declares nothing. Write the example, export it, and the
 * file's name, its doc comment and its own source become the tab, the prose and
 * the code sample - see `demos.ts`, which is where all three come from:
 *
 *   // components/atoms/button.detail-actions.demo.tsx
 *   /** The row from a title screen. *\/
 *   export default function DetailActions() { ... }
 *
 * So nothing here is ever written by hand: this is the shape `demos.ts` produces
 * and the workbench consumes.
 */
interface DemoDef {
  name: string;
  /** What this example is demonstrating, in a sentence. */
  docs?: string;
  /** The example's source, shown beside it. Highlighted, numbered, copyable.
   *  Absent on Metro, which cannot hand a module its own text. */
  code?: string;
  render: () => ReactNode;
}

/**
 * `render` is typed against the story's own `args` and nothing else, even though
 * the object it receives at runtime also carries the resolved variants. Typing
 * it as "args plus an index signature" would widen every prop to `unknown` and
 * break the one thing that has to work: `render: (props) => <Button {...props} />`.
 * The variants that ride along are already validated by the component's `sv`,
 * which is where they came from.
 */
interface StoryDef<A extends Args> {
  name: string;
  /** Sidebar section. Keep the set small; it is navigation, not taxonomy. */
  group: string;
  /** What the component is FOR, in a sentence or two. Shown beside it. */
  docs?: string;
  /** The component's compiled `sv`. Supplies controls and the matrix. */
  variants?: AnySv;
  /** Props that are not variants: the content, the callbacks, the sizes. */
  args?: A;
  /** Only needed where a value's type does not say enough: an enum that is not
   * a variant, a number with a real range, an icon name. */
  controls?: { [K in keyof A]?: ControlSpec };
  render: (args: A) => ReactNode;
  /** Compositions a matrix cannot express: an open dialog, a stateful toggle. */
  scenes?: readonly SceneDef<A>[];
  // No `demos`: worked examples are DISCOVERED from the `*.demo.tsx` files
  // beside the component, never listed here. See `demos.ts`.
  /** Suppress the derived matrix where a grid of variants says nothing. */
  matrix?: false;
  /** Room around the component on the canvas, when it needs to breathe. */
  pad?: number;
  /**
   * How much width the canvas gives this story. See `StoryWidth`.
   *
   * For components that MEASURE THEMSELVES - a rail, a grid, a virtual list -
   * because those cannot be sized by their content and must never be scaled (see
   * `stagePresentation`). Prefer a RANGE to a number: a rail in a real app is
   * given whatever the screen has, so a rail pinned to 1100 in the workbench is
   * the one width you never ship.
   */
  width?: StoryWidth;
  /**
   * The frame this component was AUTHORED for, when `fit` is wrong.
   *
   * Most components are sized by their content and a device frame would just add
   * letterbox. The player chrome is the opposite: it lays out against the full
   * 1920x1080 stage - a flex spacer, the centred transport, the cluster pinned
   * right - so in a narrow canvas its fixed-size circles collide or run off the
   * edge. Declaring `'tv'` opens the story in the scaled stage instead, which is
   * the only place it is honest.
   */
  viewport?: 'fit' | 'tv' | 'phone' | 'tablet';
  /** How to call it, verbatim TSX, shown as a code block beside the canvas.
   * Keep it to the call site a reader would paste, not a whole screen. */
  usage?: string;
  /** Design guidance, one imperative sentence per line. `do` is what the design
   * intends; `dont` is the misuse actually seen in review. */
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
  /** The atomic level, derived from the story file's folder by `tierFor` and
   *  attached by the registry. Never declared by a story. */
  tier: string;
  docs?: string;
  /** Defaults for every control, variants included. */
  args: Args;
  controls: ResolvedControl[];
  matrix: MatrixRow[];
  scenes: Scene[];
  /** Filled by the registry from the discovered `*.demo.tsx` files, never by
   *  the story itself. */
  demos: readonly DemoDef[];
  /** Every prop the component declares, read from its own source by the registry
   *  (see props.ts). Empty on Metro, which cannot hand a module its text. */
  props: readonly PropDoc[];
  render: (args: Args) => ReactNode;
  pad: number;
  width?: StoryWidth;
  /** How much width the canvas gives it. See `StoryWidth`. */
  viewport?: 'fit' | 'tv' | 'phone' | 'tablet';
  usage?: string;
  guidelines: { do: readonly string[]; dont: readonly string[] };
}

/** A variant group holding exactly these options is the `sv` spelling of a
 * boolean prop (`block`, `active`), so it is surfaced as a real boolean rather
 * than as a two-item dropdown of strings. */
const BOOLEAN_OPTIONS = new Set(['true', 'false']);

function isBooleanGroup(options: readonly string[]): boolean {
  return options.length === 2 && options.every((option) => BOOLEAN_OPTIONS.has(option));
}

function resolveSpec(spec: ControlSpec): Control {
  if (spec === 'text') return { kind: 'text' };
  if (spec === 'boolean') return { kind: 'boolean' };
  if (spec === 'number') return { kind: 'number', min: 0, max: 100, step: 1 };
  // Every Tabler name resolves now, thousands of them, so this is a field you
  // TYPE rather than a list you step through: a stepper over 5000 options is a
  // worse way to reach `player-play-filled` than spelling it. An unknown name
  // draws the fallback glyph, which is the feedback that it was not found.
  if (spec === 'icon') return { kind: 'text' };
  if (Array.isArray(spec)) return { kind: 'select', options: [...spec] };
  const range = spec as { min: number; max: number; step?: number };
  return { kind: 'number', min: range.min, max: range.max, step: range.step ?? 1 };
}

/** Infer a control from the default value alone. This is what keeps most
 * stories down to `args` and nothing else. */
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
      // Strip diacritics before the alphanumeric filter, so an accented name
      // like "Icônes" deep-links as ?story=icones rather than as ?story=ic-nes.
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
  );
}

// `const A`: without it, `args: { icon: 'volume' }` infers `string` and every
// story that feeds a union-typed prop stops compiling. With it the defaults keep
// their literal types, so a typo in an icon name is a type error in the story
// rather than a blank square in the canvas.
function story<const A extends Args = Record<string, never>>(def: StoryDef<A>): Story {
  const args: Args = { ...def.args };
  const controls: ResolvedControl[] = [];
  const matrix: MatrixRow[] = [];

  // Variants first: they are the component's own axes, so they lead the panel
  // and they are the whole content of the matrix.
  for (const [group, raw] of Object.entries(def.variants?.options ?? {})) {
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
    // A prop that is ALSO a variant already has its control, from the `sv`
    // itself. Declaring a default for it in `args` (so `render` can read it
    // with types) must not grow a second row for the same prop.
    if (controls.some((existing) => existing.key === key)) continue;
    const spec = def.controls?.[key as keyof A];
    const control = spec ? resolveSpec(spec) : inferSpec(value);
    // A prop with no editable shape (a callback, an array, an object) still
    // reaches `render`; it just has no row in the panel.
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
    // Overwritten by the registry, which is the only thing that knows the file.
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

/**
 * Does this story answer to that query?
 *
 * Case-insensitive on the name, the sub-section or the atomic level, so "act"
 * finds every story in Actions and "prog" finds Progress and ProgressRing. It
 * lives with the story model rather than with the palette that calls it: it is
 * the story deciding whether it is being asked for, and it is a pure function of
 * two strings, which is exactly what a test wants.
 */
function matches(story: Story, query: string): boolean {
  if (!query) return true;
  const needle = query.toLowerCase();
  return (
    story.name.toLowerCase().includes(needle) ||
    story.group.toLowerCase().includes(needle) ||
    // `?? ''`: a hand-built story (a test fixture) may carry no level, and a
    // search box is the last place that should throw.
    (story.tier ?? '').toLowerCase().includes(needle)
  );
}

/**
 * Sidebar order. Foundations first because everything else is built out of them,
 * then the things you compose with, then the brand. Any group not listed follows,
 * alphabetically, so adding one is never a silent no-op.
 */
const GROUP_ORDER = ['Foundations', 'Layout', 'Actions', 'Input', 'Media', 'State', 'Brand'];

/**
 * The atomic levels, in the order the design system builds them up: tokens, then
 * the indivisible controls, then arrangements, then whole regions, then page
 * skeletons. This is the sidebar's own order, so the list reads as the hierarchy
 * rather than as an alphabet.
 *
 * `Foundations` leads because it IS level one - the tokens every other level is
 * made of. `Pages` is absent on purpose: a page is a template filled with real
 * data, so it belongs to an app, not to the kit (see src/components/README.md).
 */
const TIER_ORDER = ['Foundations', 'Atoms', 'Molecules', 'Organisms', 'Templates'];

/**
 * Which atomic level a story belongs to, read from WHERE ITS FILE IS.
 *
 * Nothing declares this. A story cannot claim to be an atom while sitting in
 * `organisms/`, because the folder is the claim - which is the same reason a
 * demo's name comes from its file name rather than from a field. Move a component
 * between levels and the workbench follows on the next reload.
 */
function tierFor(path: string): string {
  const at = /\/components\/(atoms|molecules|organisms|templates)\//.exec(path);
  if (at?.[1]) return `${at[1].charAt(0).toUpperCase()}${at[1].slice(1)}`;
  if (path.includes('/foundations/')) return 'Foundations';
  return 'Other';
}

/**
 * The distinct values of `key`, each with the items that carry it, in ENCOUNTER
 * order.
 *
 * Encounter order is load-bearing: `orderStories` has already sorted the
 * registry by level, then group, then name, so taking distinct values in the
 * order they appear IS the sorted order - no second sort to keep in step with
 * the first. It is one function because the palette groups by level and the
 * sidebar groups by level and then by group, and three copies of a group-by is
 * three chances for those two to disagree about where a component lives.
 */
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

/** Attach the level each story's file implies. Called by both registries, which
 * are the only places that know a story's path. */
function attachTiers(stories: readonly Story[], paths: readonly string[]): Story[] {
  return stories.map((entry, at) => ({ ...entry, tier: tierFor(paths[at] ?? '') }));
}

/** Sorts the registry for display: by atomic level first, so the sidebar reads
 * bottom-up like the hierarchy itself, then by the design's own grouping, then
 * by name. It lives here rather than in a registry so the ordering is ordinary,
 * testable code. */
function orderStories(stories: readonly Story[]): Story[] {
  const rankOf = (order: readonly string[], value: string) => {
    const at = order.indexOf(value);
    return at === -1 ? order.length : at;
  };
  // `?? ''` rather than a required field: a story built by hand (a test fixture)
  // or by a registry that forgot `attachTiers` must sort, not crash.
  const tier = (entry: Story) => entry.tier ?? '';
  return [...stories].sort(
    (a, b) =>
      rankOf(TIER_ORDER, tier(a)) - rankOf(TIER_ORDER, tier(b)) ||
      tier(a).localeCompare(tier(b)) ||
      rankOf(GROUP_ORDER, a.group) - rankOf(GROUP_ORDER, b.group) ||
      a.name.localeCompare(b.name),
  );
}

export type {
  Control,
  ControlSpec,
  DemoDef,
  MatrixRow,
  ResolvedControl,
  Scene,
  Story,
  StoryDef,
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
