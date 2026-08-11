// The styling engine: how a style is written, and how it resolves.
//
//   tokens/        the raw design values; the source of the default theme
//   theme.ts       the live token store: createTheme / setTheme / the version
//   breakpoint.ts  the live design width, and the mobile-first cascade over it
//   color.ts       what a colour may be written as, and how it resolves
//   shorthands.ts  the vocabulary as a rule table, and the resolver over it
//   states.ts      the interaction states, and the masking that keeps them cheap
//   normalize.ts   authored declaration -> the canonical form the resolver merges
//   types.ts       the recipe's type surface
//   recipe.ts      `sv`, the compiler
//   styles.ts      `styles`, for the shapes that are not a variant of anything

export type { Breakpoints, Responsive } from './breakpoint';
export {
  breakpointIndex,
  breakpointStep,
  currentBreakpoint,
  pinDesignWidth,
  subscribeBreakpoint,
} from './breakpoint';
export type { ColorBase, ColorValue } from './color';
export { COLOR_KEYS, color, withAlpha } from './color';
export { normalize, split, stabilise } from './normalize';
export { sv, svFor } from './recipe';
export type {
  Align,
  BoxStyleProps,
  Flag,
  Justify,
  Size,
  Spacing,
  TextLayoutProps,
  TextStyleProps,
} from './shorthands';
export {
  BOX_STYLE_PROPS,
  boxStyle,
  declaredBreakpoints,
  splitShorthand,
  TEXT_STYLE_PROPS,
  textStyle,
} from './shorthands';
export type { StateKey, SvState, SvStateName } from './states';
export { maskOf, STATE_BIT, STATE_KEYS, SV_STATES, stateSuffix } from './states';
export type { Styles } from './styles';
export { sharedStyle, style, styles } from './styles';
export type { RingToken, Theme, ThemeOverrides, ThemeTokens } from './theme';
export {
  activeTheme,
  createTheme,
  groundShade,
  KROMA,
  KROMA_LIGHT,
  onPaper,
  onThemeChange,
  radiusValue,
  setTheme,
  themed,
  themeVersion,
} from './theme';
export type { ThemeMode } from './theme-mode';
export {
  applyMode,
  isThemeMode,
  readMode,
  resolveMode,
  THEME_COOKIE,
  writeMode,
} from './theme-mode';
export * from './tokens';
export type {
  AnyStyle,
  AnySv,
  CompoundVariant,
  Decl,
  FlatLayer,
  FlatVariantGroups,
  HasRoot,
  Layer,
  Resolved,
  SlotShapes,
  StyleDecl,
  StyleSlots,
  SvConfig,
  SvFlatConfig,
  SvFn,
  Variant,
  VariantGroups,
  VariantPicks,
  VariantProps,
  VariantSource,
} from './types';
export { useBreakpoint, useBreakpointStep } from './use-breakpoint';
export { ThemeProvider, useSystemGround, useTheme } from './use-theme';
