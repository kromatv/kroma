// `sv` = style variants: a props-to-style lookup for React Native, which has no
// className to drive with something like `cva`/tailwind-variants. A slotted
// config (`slots` instead of `base`) styles a component with named parts. Each
// resolved combination is memoized and frozen; the caller's own `style` is
// always merged last.

import type { StyleProp, TextStyle, ViewStyle } from 'react-native';

// TextStyle extends ViewStyle in React Native's types, so it is the widest style
// shape a component composes.
type Style = TextStyle;

// The intersection - not TextStyle - because the two are only mutually
// assignable under mainline React Native's types: the tvos fork (which the
// phone app's checker resolves) types some properties differently, so a plain
// TextStyle there would satisfy neither a <View> nor a <Text>. The casts below
// are safe downcasts; nothing changes at runtime.
type AnyStyle = ViewStyle & TextStyle;

/** A variant group: the prop name maps to its options' styles. */
export type VariantGroups = Record<string, Record<string, Style>>;

/** The props a compiled `sv` accepts: one optional key per variant group,
 * typed to that group's option names. */
export type VariantProps<V> = {
  [K in keyof V]?: keyof V[K];
};

export interface CompoundVariant<V> {
  /** All of these must match for `style` to apply. */
  when: VariantProps<V>;
  style: Style;
}

export interface SvConfig<V extends VariantGroups> {
  /** Always applied, first. */
  base?: Style;
  variants?: V;
  /** Styles that only apply to a COMBINATION of variants. */
  compound?: readonly CompoundVariant<V>[];
  /** Used when the caller leaves a variant prop undefined. */
  defaults?: VariantProps<V>;
}

/** The introspection surface a compiled `sv` carries, slotted or not. It is
 * what the workbench reads to derive a story's controls and variant matrix
 * without anything hand-written. */
export interface VariantSource {
  /** Group name to its option names, in declaration order. */
  options: Record<string, readonly string[]>;
  /** What each group resolves to when the caller passes nothing. */
  defaults: Record<string, PropertyKey | undefined>;
}

/**
 * The compiled variant function. Extra `overrides` are appended last.
 *
 * Returns `AnyStyle[]` rather than the wider `StyleProp<ViewStyle>` so the
 * result stays inspectable instead of collapsing to a union, and carries its
 * own `config` so the workbench can derive controls without a hand-kept list.
 */
export type SvFn<V extends VariantGroups> = ((
  props?: VariantProps<V>,
  ...overrides: StyleProp<ViewStyle>[]
) => AnyStyle[]) & {
  /** The declaration this was compiled from, verbatim. */
  config: SvConfig<V>;
  options: { [K in keyof V]: (keyof V[K])[] };
  defaults: VariantProps<V>;
};

/** Slot name to its always-applied base style. */
export type Slots = Record<string, Style>;

/** A slotted variant group: each option styles any subset of the slots. */
export type SlotVariantGroups<S extends Slots> = Record<
  string,
  Record<string, Partial<Record<keyof S, Style>>>
>;

export interface SvSlotsConfig<S extends Slots, V extends SlotVariantGroups<S>> {
  slots: S;
  variants?: V;
  compound?: readonly { when: VariantProps<V>; style: Partial<Record<keyof S, Style>> }[];
  defaults?: VariantProps<V>;
}

/** What a slotted call returns: one stable, frozen style array per slot. The
 * arrays are `AnyStyle[]` so a `label` slot lands on a <Text> and a `root` slot
 * on a <View> without either fork's checker objecting - see `AnyStyle`. */
export type SlotStyles<S extends Slots> = { readonly [K in keyof S]: AnyStyle[] };

export type SvSlotsFn<S extends Slots, V extends SlotVariantGroups<S>> = ((
  props?: VariantProps<V>,
) => SlotStyles<S>) & {
  config: SvSlotsConfig<S, V>;
  options: { [K in keyof V]: (keyof V[K])[] };
  defaults: VariantProps<V>;
};

/** Cache key for the caller's picks resolved against the defaults, in
 * group-declaration order, so two calls resolving to the same combination
 * share one entry. Split from `resolvePicked` and allocation-free since the
 * cache hit is the hot path. */
function pickKey(
  groups: readonly string[],
  props: Record<string, PropertyKey | undefined> | undefined,
  defaults: Record<string, PropertyKey | undefined>,
): string {
  let key = '';
  for (const group of groups) key += `${String(props?.[group] ?? defaults[group])}|`;
  return key;
}

function resolvePicked(
  groups: readonly string[],
  props: Record<string, PropertyKey | undefined> | undefined,
  defaults: Record<string, PropertyKey | undefined>,
): Record<string, PropertyKey | undefined> {
  const picked: Record<string, PropertyKey | undefined> = {};
  for (const group of groups) picked[group] = props?.[group] ?? defaults[group];
  return picked;
}

function compoundMatches(
  when: Record<string, PropertyKey | undefined>,
  picked: Record<string, PropertyKey | undefined>,
): boolean {
  return Object.entries(when).every(([group, value]) => picked[group] === value);
}

/** Push one layer - a variant's slot styles, or a compound rule's - onto each
 * slot's stack. The variant loop and the compound loop apply layers the same
 * way, so they say it once. */
function pushLayer(
  out: Record<string, AnyStyle[]>,
  names: readonly string[],
  layer: Record<string, unknown> | undefined,
): void {
  if (!layer) return;
  for (const name of names) {
    const style = layer[name];
    if (style) out[name]?.push(style as AnyStyle);
  }
}

export function sv<V extends VariantGroups>(config: SvConfig<V>): SvFn<V>;
export function sv<S extends Slots, const V extends SlotVariantGroups<S>>(
  config: SvSlotsConfig<S, V>,
): SvSlotsFn<S, V>;
export function sv(
  config: SvConfig<VariantGroups> | SvSlotsConfig<Slots, SlotVariantGroups<Slots>>,
): unknown {
  return 'slots' in config ? compileSlots(config) : compileFlat(config);
}

function compileFlat(config: SvConfig<VariantGroups>): SvFn<VariantGroups> {
  const { base, variants, compound, defaults = {} } = config;
  const groups = variants ? Object.keys(variants) : [];

  // One resolved (frozen) array per combination ever asked for. The option
  // space is finite and the styles are static, so this is small and exact.
  const cache = new Map<string, AnyStyle[]>();

  const resolve = (props?: VariantProps<VariantGroups>): AnyStyle[] => {
    const key = pickKey(groups, props, defaults);
    const hit = cache.get(key);
    if (hit) return hit;

    const picked = resolvePicked(groups, props, defaults);
    const out: AnyStyle[] = [];
    if (base) out.push(base as AnyStyle);
    for (const group of groups) {
      const value = picked[group];
      if (value === undefined) continue;
      const style = variants?.[group]?.[value as string];
      if (style) out.push(style as AnyStyle);
    }
    for (const rule of compound ?? []) {
      if (compoundMatches(rule.when, picked)) out.push(rule.style as AnyStyle);
    }
    cache.set(key, Object.freeze(out) as AnyStyle[]);
    return out;
  };

  const fn = ((props?: VariantProps<VariantGroups>, ...overrides: StyleProp<ViewStyle>[]) => {
    const combo = resolve(props);
    // No overrides is the hot path: hand back the SAME array so a re-render is
    // identity-equal and styleq's cache short-circuits.
    let out: AnyStyle[] | null = null;
    for (const override of overrides) {
      if (!override) continue;
      out ??= [...combo];
      out.push(override as AnyStyle);
    }
    return out ?? combo;
  }) as SvFn<VariantGroups>;

  fn.config = config;
  fn.defaults = defaults;
  fn.options = Object.fromEntries(
    groups.map((group) => [group, Object.keys(variants?.[group] ?? {})]),
  );
  return fn;
}

function compileSlots(
  config: SvSlotsConfig<Slots, SlotVariantGroups<Slots>>,
): SvSlotsFn<Slots, SlotVariantGroups<Slots>> {
  const { slots, variants, compound, defaults = {} } = config;
  const groups = variants ? Object.keys(variants) : [];
  const names = Object.keys(slots);

  const cache = new Map<string, SlotStyles<Slots>>();

  const fn = ((props?: VariantProps<SlotVariantGroups<Slots>>) => {
    const key = pickKey(groups, props, defaults);
    const hit = cache.get(key);
    if (hit) return hit;

    const picked = resolvePicked(groups, props, defaults);
    const out: Record<string, AnyStyle[]> = {};
    for (const [name, baseStyle] of Object.entries(slots)) out[name] = [baseStyle as AnyStyle];
    for (const group of groups) {
      const value = picked[group];
      if (value === undefined) continue;
      pushLayer(out, names, variants?.[group]?.[value as string]);
    }
    for (const rule of compound ?? []) {
      if (compoundMatches(rule.when, picked)) pushLayer(out, names, rule.style);
    }
    for (const name of names) Object.freeze(out[name]);
    const frozen = Object.freeze(out) as SlotStyles<Slots>;
    cache.set(key, frozen);
    return frozen;
  }) as SvSlotsFn<Slots, SlotVariantGroups<Slots>>;

  fn.config = config;
  fn.defaults = defaults;
  fn.options = Object.fromEntries(
    groups.map((group) => [group, Object.keys(variants?.[group] ?? {})]),
  );
  return fn;
}
