import type { ImageStyle, TextStyle, ViewStyle } from 'react-native';

type Native = ViewStyle & TextStyle & ImageStyle;

type Wide<K extends string, T = string> =
  | Exclude<K extends keyof Native ? Native[K] : never, undefined>
  | T;

/**
 * Browser-only properties a declaration may state beside React Native's, and
 * the native ones a browser also reads as free CSS text (`62vh`, a `var()`).
 * A native renderer has no spelling for the former and ignores them; the
 * browser renderer compiles both to classes as it does the rest.
 */
export interface WebStyle {
  animationKeyframes?:
    | string
    | Record<string, object>
    | ReadonlyArray<string | Record<string, object>>;
  animationDuration?: string;
  animationTimingFunction?: string;
  animationDelay?: string;
  animationFillMode?: string;
  animationIterationCount?: string | number;
  transitionProperty?: Wide<'transitionProperty'>;
  transitionDuration?: Wide<'transitionDuration'>;
  transitionTimingFunction?: Wide<'transitionTimingFunction'>;
  transitionDelay?: Wide<'transitionDelay'>;
  transition?: string;
  textShadow?: string;
  textUnderlineOffset?: number | string;
  objectFit?: Wide<'objectFit', 'cover' | 'contain' | 'fill' | 'none' | 'scale-down'>;
  objectPosition?: string;
  backgroundImage?: string;
  backgroundPosition?: string;
  backgroundSize?: string;
  maskImage?: string;
  WebkitMaskImage?: string;
  backdropFilter?: string;
  WebkitBackdropFilter?: string;
  boxShadow?: Wide<'boxShadow'>;
  willChange?: string;
  cursor?: Wide<'cursor'>;
  scrollbarWidth?: 'auto' | 'thin' | 'none';
  touchAction?: string;
  userSelect?: Wide<'userSelect', 'none' | 'text' | 'auto'>;
  whiteSpace?: 'normal' | 'nowrap' | 'pre' | 'pre-wrap';
  display?: Wide<
    'display',
    'flex' | 'none' | 'block' | 'inline' | 'inline-flex' | 'grid' | 'contents'
  >;
  position?: Wide<'position', 'absolute' | 'relative' | 'static' | 'fixed' | 'sticky'>;
  overflowX?: 'visible' | 'hidden' | 'scroll' | 'auto';
  overflowY?: 'visible' | 'hidden' | 'scroll' | 'auto';
  inset?: Wide<'inset'>;
  width?: Wide<'width'>;
  height?: Wide<'height'>;
  minWidth?: Wide<'minWidth'>;
  minHeight?: Wide<'minHeight'>;
  maxWidth?: Wide<'maxWidth'>;
  maxHeight?: Wide<'maxHeight'>;
  top?: Wide<'top'>;
  right?: Wide<'right'>;
  bottom?: Wide<'bottom'>;
  left?: Wide<'left'>;
  paddingLeft?: Wide<'paddingLeft'>;
  paddingRight?: Wide<'paddingRight'>;
  paddingTop?: Wide<'paddingTop'>;
  paddingBottom?: Wide<'paddingBottom'>;
  borderRadius?: Wide<'borderRadius'>;
  borderBottomStyle?: 'solid' | 'dashed' | 'dotted' | 'none';
  marginLeft?: Wide<'marginLeft'>;
  marginRight?: Wide<'marginRight'>;
  marginTop?: Wide<'marginTop'>;
  marginBottom?: Wide<'marginBottom'>;
  marginBlock?: Wide<'marginBlock'>;
  marginInline?: Wide<'marginInline'>;
  paddingBlock?: Wide<'paddingBlock'>;
  paddingInline?: Wide<'paddingInline'>;
  fontSize?: Wide<'fontSize'>;
  lineHeight?: Wide<'lineHeight'>;
  overflowAnchor?: 'auto' | 'none';
  scrollPadding?: number | string;
  wordBreak?: 'normal' | 'break-all' | 'keep-all' | 'break-word';
  listStyleType?: 'none' | 'disc' | 'decimal';
  letterSpacing?: Wide<'letterSpacing'>;
  fontVariantNumeric?: string;
  backgroundClip?: 'text' | 'border-box' | 'padding-box' | 'content-box';
  WebkitBackgroundClip?: 'text' | 'border-box' | 'padding-box' | 'content-box';
  margin?: Wide<'margin'>;
  padding?: Wide<'padding'>;
  accentColor?: string;
  gridTemplateColumns?: string;
  gridColumn?: string;
  columnGap?: number | string;
  rowGap?: number | string;
  backgroundRepeat?: string;
  outlineStyle?: Wide<'outlineStyle', 'none' | 'solid' | 'dashed' | 'dotted'>;
  outlineColor?: Exclude<ViewStyle['outlineColor'] | TextStyle['outlineColor'], undefined> | string;
  filter?: Exclude<ViewStyle['filter'], undefined> | string;
}
