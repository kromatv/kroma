// The control model: a component's `sv` and a story's args become the editors
// in the panel and the rows in the matrix. Nothing here knows about a story.

import type { VariantSource } from '@kroma/ui/kit';

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

interface VariantGroup {
  control: ResolvedControl;
  row: MatrixRow;
  value: unknown;
}

function variantGroup(
  group: string,
  raw: readonly string[],
  fallback: VariantSource['defaults'][string],
): VariantGroup {
  const options = raw.map(String);
  if (isBooleanGroup(options)) {
    return {
      control: { key: group, control: { kind: 'boolean' }, variant: true },
      row: { group, options: [false, true] },
      value: String(fallback) === 'true',
    };
  }
  return {
    control: { key: group, control: { kind: 'select', options }, variant: true },
    row: { group, options },
    value: fallback === undefined ? options[0] : String(fallback),
  };
}

interface DerivedVariants {
  controls: ResolvedControl[];
  matrix: MatrixRow[];
  defaults: Args;
}

function variantControls(
  variants: VariantSource | undefined,
  omit: readonly string[] = [],
): DerivedVariants {
  const omitted = new Set(omit);
  const derived: DerivedVariants = { controls: [], matrix: [], defaults: {} };
  for (const [group, raw] of Object.entries(variants?.options ?? {})) {
    if (omitted.has(group)) continue;
    const { control, row, value } = variantGroup(group, raw, variants?.defaults?.[group]);
    derived.controls.push(control);
    derived.matrix.push(row);
    derived.defaults[group] = value;
  }
  return derived;
}

function argControls(
  args: Args,
  specs: Readonly<Partial<Record<string, ControlSpec>>>,
  variantKeys: ReadonlySet<string>,
): ResolvedControl[] {
  const out: ResolvedControl[] = [];
  for (const [key, value] of Object.entries(args)) {
    // A prop that is also a variant already has its control from the `sv`.
    if (variantKeys.has(key)) continue;
    const spec = specs[key];
    const control = spec ? resolveSpec(spec) : inferSpec(value);
    if (control) out.push({ key, control, variant: false });
  }
  return out;
}

export type { Args, Control, ControlSpec, MatrixRow, ResolvedControl };
export { argControls, variantControls };
