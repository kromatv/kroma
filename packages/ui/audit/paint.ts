// The design, written down so a reduction can prove it did not move.
//
// A node count says how much DOM a component costs; it says nothing about
// whether the picture survived. This does: one line per CONTENT LEAF - the
// text, the glyph, the input, the image - carrying its own typography plus the
// visual context its ancestors accumulate. Deleting a redundant wrapper leaves
// every line identical, because the values that reach the leaf are the same
// values. Losing a colour, a radius, a padding, a transform, a transition or a
// flex container that was actually distributing children changes a line.

import {
  clips,
  declared,
  EDGES,
  type Edge,
  hasOwnText,
  kidsOf,
  positioned,
  px,
  TRANSPARENT,
  tagOf,
} from './dom';
import { styleOf } from './style';

type Pad = readonly [number, number, number, number];

interface Context {
  pad: Pad;
  bg: readonly string[];
  radius: readonly string[];
  border: readonly string[];
  shadow: readonly string[];
  transform: readonly string[];
  transition: readonly string[];
  size: readonly string[];
  opacity: number;
  /** Opacities the ground decides, which are a custom property rather than a
   * number (see `CSS_FADED`); kept as written since they cannot be multiplied. */
  fade: readonly string[];
  flex: readonly string[];
  place: readonly string[];
  absolute: number;
  clip: number;
}

const NOTHING: Context = {
  pad: [0, 0, 0, 0],
  bg: [],
  radius: [],
  border: [],
  shadow: [],
  transform: [],
  transition: [],
  size: [],
  opacity: 1,
  fade: [],
  flex: [],
  place: [],
  absolute: 0,
  clip: 0,
};

function plus(list: readonly string[], value: string): readonly string[] {
  return value ? [...list, value] : list;
}

function radiusOf(style: CSSStyleDeclaration): string {
  // jsdom answers a longhand with `0` when only the shorthand was set, so a
  // zero longhand is a question rather than an answer.
  const corners = ['top-left', 'top-right', 'bottom-right', 'bottom-left'].map((corner) => {
    const own = style.getPropertyValue(`border-${corner}-radius`);
    if (px(own) !== 0 || own.includes('%')) return own;
    return style.getPropertyValue('border-radius') || own;
  });
  return corners.every((corner) => !corner || px(corner) === 0) ? '' : corners.join(' ');
}

function borderOf(style: CSSStyleDeclaration): string {
  const sides = EDGES.map((edge) => {
    const width =
      style.getPropertyValue(`border-${edge}-width`) || style.getPropertyValue('border-width');
    const line =
      style.getPropertyValue(`border-${edge}-style`) || style.getPropertyValue('border-style');
    if (px(width) === 0 || line === 'none') return '-';
    const tint =
      style.getPropertyValue(`border-${edge}-color`) || style.getPropertyValue('border-color');
    return `${width} ${tint}`;
  });
  return sides.every((side) => side === '-') ? '' : sides.join('|');
}

function sizeOf(style: CSSStyleDeclaration): string {
  return ['width', 'height', 'min-width', 'min-height', 'max-width', 'max-height']
    .map((prop) => [prop, style.getPropertyValue(prop)] as const)
    .filter(([, value]) => value && !['auto', '', 'none', '0px', '0'].includes(value))
    .map(([prop, value]) => `${prop.replace('-', '')}=${value}`)
    .join(',');
}

// react-native-web's flex defaults: a container placing children here is not
// shaping anything a child could not.
const RESTING_ALIGN = new Set(['stretch', 'normal', '']);
const RESTING_JUSTIFY = new Set(['flex-start', 'normal', '']);

/** What a flex container does to the picture. Two or more children make every
 * facet count; a lone child still MOVES under `align-items`/`justify-content`
 * (an icon well centring its glyph), so those survive even for one. */
function flexOf(el: Element, style: CSSStyleDeclaration): string {
  if (el.children.length === 0 || style.display !== 'flex') return '';
  const placed = !RESTING_ALIGN.has(style.alignItems) || !RESTING_JUSTIFY.has(style.justifyContent);
  if (el.children.length < 2 && !placed) return '';
  // jsdom does not expand the `gap` shorthand into its longhands, so a bare
  // longhand read misses every gap react-native-web writes.
  const gap = `${px(style.rowGap || style.getPropertyValue('gap'))}/${px(style.columnGap || style.getPropertyValue('gap'))}`;
  return `${style.flexDirection}:${style.alignItems}:${style.justifyContent}:${style.flexWrap}:g${gap}:n${el.children.length}`;
}

/** How this element places ITSELF against its container's cross axis, which is
 * the one alignment a parent cannot see: `align-self` on a leaf is what let a
 * glyph escape the well centring it. */
function selfOf(style: CSSStyleDeclaration): string {
  const self = style.alignSelf;
  return self && !['auto', ''].includes(self) ? self : '';
}

function backgroundOf(style: CSSStyleDeclaration): readonly string[] {
  const fill = TRANSPARENT.has(style.backgroundColor) ? '' : style.backgroundColor;
  return [fill, declared(style.backgroundImage)].filter(Boolean);
}

function animationOf(style: CSSStyleDeclaration): readonly string[] {
  const named = style.transitionProperty;
  const transition =
    named && named !== 'all'
      ? `${named} ${style.transitionDuration}`
      : style.getPropertyValue('transition');
  const animation = declared(style.animationName || style.getPropertyValue('animation'));
  return [
    transition.trim(),
    animation ? `@${animation} ${style.animationDuration}`.trim() : '',
  ].filter(Boolean);
}

function padOf(pad: Pad, style: CSSStyleDeclaration): Pad {
  const inset = (edge: Edge) =>
    px(style.getPropertyValue(`padding-${edge}`)) + px(style.getPropertyValue(`margin-${edge}`));
  const [top, right, bottom, left] = pad;
  return [
    top + inset('top'),
    right + inset('right'),
    bottom + inset('bottom'),
    left + inset('left'),
  ];
}

function extend(context: Context, el: Element): Context {
  const style = styleOf(el);
  const opacity = (style.opacity || '1').trim();
  const numeric = Number.parseFloat(opacity);
  // A number multiplies down the chain; anything else (a custom property) can
  // only be recorded as written.
  const multiplies = `${numeric}` === opacity;
  return {
    pad: padOf(context.pad, style),
    bg: [...context.bg, ...backgroundOf(style)],
    radius: plus(context.radius, radiusOf(style)),
    border: plus(context.border, borderOf(style)),
    shadow: plus(context.shadow, declared(style.boxShadow)),
    transform: plus(context.transform, declared(style.transform)),
    transition: [...context.transition, ...animationOf(style)],
    size: plus(context.size, sizeOf(style)),
    opacity: multiplies ? context.opacity * numeric : context.opacity,
    fade: multiplies || opacity === '1' ? context.fade : [...context.fade, opacity],
    flex: plus(context.flex, flexOf(el, style)),
    place: plus(context.place, selfOf(style)),
    absolute: context.absolute + (positioned(style) ? 1 : 0),
    clip: context.clip + (clips(style) ? 1 : 0),
  };
}

const TYPE_PROPS = [
  'color',
  'font-size',
  'font-weight',
  'font-family',
  'letter-spacing',
  'line-height',
  'text-align',
  'text-transform',
  'text-decoration-line',
] as const;

function typography(el: Element): string {
  const style = styleOf(el);
  // The trailing separators of the roles a node did not answer for. Trimmed by
  // hand rather than with `/\/+$/`, whose unanchored run backtracks at every
  // position in the string.
  const spelled = TYPE_PROPS.map((prop) => style.getPropertyValue(prop)).join('/');
  let end = spelled.length;
  while (end > 0 && spelled[end - 1] === '/') end -= 1;
  return spelled.slice(0, end);
}

function glyph(el: Element): string {
  const attrs = ['width', 'height', 'stroke', 'fill', 'stroke-width', 'viewBox'];
  return attrs.map((attr) => `${attr}=${el.getAttribute(attr) ?? ''}`).join(' ');
}

function own(el: Element): string {
  const tag = tagOf(el);
  if (tag === 'svg') return glyph(el);
  if (tag === 'img') return `src=${el.getAttribute('src') ?? ''}`;
  if (tag === 'input' || tag === 'textarea') {
    return `type=${el.getAttribute('type') ?? 'text'} placeholder=${el.getAttribute('placeholder') ?? ''} ${typography(el)}`;
  }
  return typography(el);
}

// A clock reads differently every run and on every machine's timezone. The text
// is here to name the leaf, so a time is named as a time.
const CLOCK = /\d{1,2}:\d{2}(:\d{2})?(\s?[AP]M)?/gi;

function text(el: Element): string {
  return (el.textContent ?? '').replace(/\s+/g, ' ').trim().replace(CLOCK, '--:--').slice(0, 60);
}

function listed(name: string, values: readonly string[]): string {
  return values.length > 0 ? `${name}=[${values.join(' ')}]` : '';
}

function render(context: Context): string {
  const parts = [
    `pad=${context.pad.join(',')}`,
    `op=${context.opacity.toFixed(3)}`,
    listed('fade', context.fade),
    listed('bg', context.bg),
    listed('radius', context.radius),
    listed('border', context.border),
    listed('shadow', context.shadow),
    listed('tf', context.transform),
    listed('anim', context.transition),
    listed('size', context.size),
    listed('flex', context.flex),
    listed('self', context.place),
    context.absolute > 0 ? `abs=${context.absolute}` : '',
    context.clip > 0 ? `clip=${context.clip}` : '',
  ];
  return parts.filter(Boolean).join(' ');
}

function collect(el: Element, context: Context, out: string[]): void {
  const next = extend(context, el);
  const kids = kidsOf(el);
  const ownText = hasOwnText(el);
  if (kids.length === 0 || ownText) {
    out.push(`${tagOf(el)} "${text(el)}" ${own(el)} << ${render(next)}`);
  }
  for (const kid of kids) collect(kid, next, out);
}

/** One line per content leaf: what it looks like, and the visual context that
 * reaches it. Byte-identical across a refactor means the picture is unchanged. */
function signatureOf(roots: readonly Element[]): readonly string[] {
  const out: string[] = [];
  for (const root of roots) collect(root, NOTHING, out);
  return out;
}

export { signatureOf };
