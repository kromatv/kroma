// `sv` = style variants. What `cva` is to Tailwind class strings, this is to
// React Native styles.
//
// Why it exists: React Native has no className, so the honest way to express "a
// primary button, large" is a lookup from props to style objects. Hand-rolling
// that per component produces the ternary soup this kit is meant to eliminate:
//
//   style={[s.base, variant === 'primary' && s.primary, size === 'lg' && s.lg]}
//
// With `sv` the component declares its design once and reads as a shadcn
// component does:
//
//   const button = sv({
//     base: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.md },
//     variants: {
//       variant: { primary: { backgroundColor: colors.accent }, ghost: {} },
//       size: { md: { paddingHorizontal: 36 }, sm: { paddingHorizontal: 20 } },
//     },
//     compound: [{ when: { variant: 'primary', size: 'sm' }, style: { borderRadius: 8 } }],
//     defaults: { variant: 'primary', size: 'md' },
//   });
//
//   <View style={button({ variant, size }, style)} />
//
// The caller's own `style` is always merged LAST, so a one-off override wins,
// exactly like passing `className` to a shadcn component.
//
// A component with named parts declares SLOTS instead of `base`, the way
// tailwind-variants does, and every part's design lives in the one declaration
// rather than in parallel lookup maps beside it:
//
//   const button = sv({
//     slots: { root: { flexDirection: 'row' }, label: { fontWeight: '700' } },
//     variants: {
//       size: {
//         md: { root: { paddingHorizontal: 36 }, label: { fontSize: 16 } },
//         sm: { root: { paddingHorizontal: 20 }, label: { fontSize: 13 } },
//       },
//     },
//     defaults: { size: 'md' },
//   });
//
//   const s = button({ size });
//   <View style={[s.root, style]}><Text style={s.label} /></View>
//
// Both forms resolve each variant combination ONCE and hand back the same
// (frozen) arrays on every call after that. The style objects themselves are
// the module-level declarations, so a row in a browse grid re-rendering does
// not allocate, and react-native-web's styleq cache is hit by identity instead
// of re-walking the declarations. Do not mutate what a compiled `sv` returns.

import type { StyleProp, TextStyle, ViewStyle } from 'react-native';

// TextStyle extends ViewStyle in React Native's types, so it is the WIDEST of
// the style shapes a component composes: one type lets a declaration carry
// paddings and fontSizes alike.
type Style = TextStyle;

// What a compiled `sv` RETURNS. The intersection - not TextStyle - because the
// two interfaces are only mutually assignable under mainline React Native's
// types: the tvos fork (which the phone app's checker resolves) declares a few
// properties with literal unions the other spells differently, so a TextStyle
// there is NOT a ViewStyle and a plain-TextStyle result would satisfy neither
// a <View>'s style prop nor a <Text>'s across both type sets. An intersection
// is assignable to each by construction, whichever fork is looking. The casts
// into it below are downcasts (the intersection is a subtype of Style), legal
// under every checker; at runtime nothing changes - these are the same frozen
// declaration objects either way.
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
 * It returns a flat `AnyStyle[]` rather than the wider `StyleProp<ViewStyle>`:
 * an array is what React Native wants anyway, and the concrete type keeps the
 * result inspectable (in tests, and when composing one variant set into another)
 * instead of collapsing to a union you have to narrow first.
 *
 * It also carries its own declaration. That is what lets the workbench build a
 * component's controls and its variant matrix with nothing hand-written: the
 * variant map IS the design source, so there is no second list to keep in sync
 * and no way for the two to disagree.
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

// ---- the slotted form ----

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

// ---- shared resolution machinery ----

/** The cache key for the caller's picks resolved against the defaults: the
 * picks in group-declaration order, so two calls that resolve to the same
 * combination share one entry whatever the caller spelled out.
 *
 * Deliberately split from `resolvePicked` and allocation-free: the cache HIT is
 * the hot path, and it only needs the key. The picks record is built once per
 * combination, on the miss that fills the entry. */
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
