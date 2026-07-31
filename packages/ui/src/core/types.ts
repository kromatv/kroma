// The recipe's type surface.

import type { ImageStyle, TextStyle, ViewStyle } from 'react-native';
import type { BoxStyleProps, TextStyleProps } from '#ui/core/shorthands';
import type { SvState, SvStateName } from '#ui/core/states';

// All three, not TextStyle alone: the tvos fork types some properties
// differently, so a plain TextStyle there satisfies neither a View nor a Text —
// and a resolved slot is routinely shared between an <Image> and the <View> that
// stands in for it while it loads. The one property the three disagree on is
// `overflow`, where the intersection drops `'scroll'`; nothing in the repo sets
// that on a style, and a scrolling container is a <ScrollView> here.
export type AnyStyle = ViewStyle & TextStyle & ImageStyle;

/** What a painted slot accepts. A key both vocabularies name takes either
 *  spelling: the shorthand adds to what React Native accepts, never subtracts,
 *  so a slot handed a plain `TextStyle` is still a legal declaration. */
declare const PAINTED: unique symbol;

export type StyleDecl = Omit<AnyStyle, keyof BoxStyleProps> & {
  [K in keyof BoxStyleProps]?: BoxStyleProps[K] | (K extends keyof AnyStyle ? AnyStyle[K] : never);
} & TextStyleProps & { readonly [PAINTED]?: true };

export type Decl<T> = T & { [K in SvStateName as `_${K}`]?: T };

/** The slots of a recipe and what each feeds, e.g.
 *  `{ root: StyleDecl; icon: IconProps }`. Naming the props type is what makes a
 *  typo in a glyph's colour a compile error. */
export type SlotShapes = Record<string, object>;

export interface HasRoot {
  root: object;
}

// Partial: a variant option paints keys the base never mentioned.
export type Layer<P extends SlotShapes> = { [K in keyof P]?: Decl<Partial<P[K]>> };

export type StyleSlots<S> = { [K in keyof S]: StyleDecl };

export type VariantGroups<P extends SlotShapes> = Record<string, Record<string, Layer<P>>>;

/**
 * A group spelled `true`/`false` also accepts a real boolean, so a caller writes
 * `active` rather than `active ? 'true' : 'false'`.
 *
 * Both spellings stay legal whichever options the group declares: one that names
 * only `true` still has to take `false` from a caller, since the absent option
 * is exactly what "off" resolves to.
 */
export type VariantPicks<V> = {
  [K in keyof V]?: keyof V[K] extends 'true' | 'false' ? boolean | 'true' | 'false' : keyof V[K];
};

export interface CompoundVariant<V, L> {
  when: VariantPicks<V>;
  style: L;
}

export interface SvConfig<P extends SlotShapes, V extends VariantGroups<P>> {
  slots: { [K in keyof P]: Decl<P[K]> };
  variants?: V;
  compound?: readonly CompoundVariant<V, Layer<P>>[];
  defaults?: VariantPicks<V>;
}

export type FlatLayer = Decl<Partial<StyleDecl>>;

export type FlatVariantGroups = Record<string, Record<string, FlatLayer>>;

/** The single-slot config. `base` is sugar for `slots: { root }` and lets every
 *  layer drop the slot name; the result still comes back under `.root`. */
export interface SvFlatConfig<V extends FlatVariantGroups> {
  base: Decl<StyleDecl>;
  variants?: V;
  compound?: readonly CompoundVariant<V, FlatLayer>[];
  defaults?: VariantPicks<V>;
}

// Keyed on the marker rather than on assignability: every props shape whose
// keys are all optional (`Pick<AvatarProps, 'size'>`) is mutually assignable
// with StyleDecl, so testing that collapsed it into a style.
type Out<T> = typeof PAINTED extends keyof T ? AnyStyle : T;

export type Resolved<P extends SlotShapes> = { readonly [K in keyof P]: Readonly<Out<P[K]>> };

export type SvFn<P extends SlotShapes, V> = ((
  variants?: VariantPicks<V>,
  state?: SvState,
) => Resolved<P>) & {
  options: { [K in keyof V]: (keyof V[K])[] };
  defaults: VariantPicks<V>;
  slots: readonly (keyof P)[];
};

/**
 * The variant props of a compiled recipe, cva-style:
 *
 *   interface ButtonProps extends VariantProps<typeof buttonVariants> { ... }
 *
 * Derived rather than retyped, so adding an option to the recipe updates every
 * consumer's type with no second list to edit.
 *
 * A conditional with `infer`, not `Parameters<F>`: a function-typed constraint
 * on `F` would make `Parameters` resolve against the constraint's `never`
 * parameter rather than the recipe's own, and every option would collapse.
 */
export type VariantProps<F> = F extends (variants?: infer VP, state?: SvState) => unknown
  ? NonNullable<VP>
  : never;

/** One group's option union, for the prop a component documents individually:
 *  `Variant<typeof buttonVariants, 'size'>` is `'sm' | 'md' | 'lg' | 'tv'`. */
export type Variant<F, G extends keyof VariantProps<F>> = NonNullable<VariantProps<F>[G]>;

/** What the workbench reads to derive a story's controls, so the variant map is
 *  the only source and there is no second list to keep in sync. */
export interface VariantSource {
  options: Record<string, readonly string[]>;
  defaults: Record<string, PropertyKey | boolean | undefined>;
}

/**
 * Any compiled recipe, for a component that takes one without knowing its slots.
 *
 * The parameter is `never` because a function is only assignable to another
 * whose parameters are wider, and a recipe's own parameter is the narrow union
 * of its option names. `root` is required: it is the slot a host component
 * paints itself with, so a recipe without one is rejected where it is passed
 * rather than painting nothing where it renders.
 */
export type AnySv = {
  (variants?: never, state?: SvState): HasRoot & Record<string, object>;
  slots: readonly string[];
};
