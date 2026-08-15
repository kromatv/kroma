// What a rendered component costs the DOM, and which of its elements are
// candidates for removal. Reads a mounted subtree; renders nothing itself.

import {
  clips,
  declared,
  EDGES,
  eachElement,
  hasOwnText,
  kidsOf,
  positioned,
  px,
  TRANSPARENT,
  tagOf,
} from './dom';
import { styleOf } from './style';

interface Facts {
  tag: string;
  /** Draws or clips something, so removing it changes the picture. */
  paints: boolean;
  /** The layout properties it contributes, which a child could carry instead. */
  layout: readonly string[];
  /** Attributes that mean something to a browser or a screen reader. */
  semantic: readonly string[];
  /** Mounted but invisible: `display:none`, `visibility:hidden` or fully transparent. */
  hidden: boolean;
  ownText: boolean;
  kids: number;
}

type SmellKind = 'passthrough' | 'wrapper' | 'glyph-wrapper' | 'void' | 'hidden-subtree';

interface Smell {
  kind: SmellKind;
  at: string;
  note: string;
}

interface Cost {
  /** Elements, counting an `<svg>` as one and ignoring what is inside it. */
  nodes: number;
  /** Elements with no element child: the text, inputs and glyphs that ARE the content. */
  leaves: number;
  /** `nodes - leaves`: the structure, which is what an audit tries to shrink. */
  overhead: number;
  depth: number;
  svg: number;
  bytes: number;
  smells: readonly Smell[];
}

const SIZE_PROPS = [
  'width',
  'height',
  'min-width',
  'min-height',
  'max-width',
  'max-height',
  'flex-basis',
] as const;

function borders(style: CSSStyleDeclaration): boolean {
  return EDGES.some(
    (edge) =>
      px(style.getPropertyValue(`border-${edge}-width`)) > 0 &&
      style.getPropertyValue(`border-${edge}-style`) !== 'none',
  );
}

function paints(style: CSSStyleDeclaration): boolean {
  if (!TRANSPARENT.has(style.backgroundColor)) return true;
  if (declared(style.backgroundImage)) return true;
  if (borders(style)) return true;
  if (declared(style.boxShadow)) return true;
  if (declared(style.transform)) return true;
  if (declared(style.filter)) return true;
  const opacity = Number.parseFloat(style.opacity || '1');
  if (opacity > 0 && opacity < 1) return true;
  if (clips(style) || positioned(style)) return true;
  const zIndex = style.zIndex;
  return zIndex !== '' && zIndex !== 'auto' && Number.parseInt(zIndex, 10) !== 0;
}

// The spacing a box adds around what is inside it, edge by edge.
function spacing(style: CSSStyleDeclaration): readonly string[] {
  const found = EDGES.flatMap((edge) => [
    px(style.getPropertyValue(`padding-${edge}`)) === 0 ? '' : `padding-${edge}`,
    px(style.getPropertyValue(`margin-${edge}`)) === 0 ? '' : `margin-${edge}`,
  ]);
  const gaps = ['row-gap', 'column-gap'].map((gap) =>
    px(style.getPropertyValue(gap)) === 0 ? '' : gap,
  );
  return [...found, ...gaps].filter(Boolean);
}

const UNSET_SIZE = new Set(['auto', '', 'none', '0px']);

function sizing(style: CSSStyleDeclaration): readonly string[] {
  return SIZE_PROPS.filter((prop) => {
    const value = style.getPropertyValue(prop);
    return Boolean(value) && !UNSET_SIZE.has(value);
  });
}

// How a flex box arranges its children. Only a flex box does: jsdom answers
// `flex-direction: row` for a plain block as readily as for a real one.
function arranging(style: CSSStyleDeclaration): readonly string[] {
  if (!['flex', 'inline-flex'].includes(style.display)) return [];
  return [
    ['flex-start', 'normal', ''].includes(style.justifyContent) ? '' : 'justify-content',
    style.flexDirection === 'row' ? 'flex-direction' : '',
    ['nowrap', ''].includes(style.flexWrap) ? '' : 'flex-wrap',
  ].filter(Boolean);
}

function layout(style: CSSStyleDeclaration): readonly string[] {
  const found: string[] = [...spacing(style), ...sizing(style)];
  if (Number.parseFloat(style.flexGrow || '0') !== 0) found.push('flex-grow');
  if (style.alignSelf && !['auto', ''].includes(style.alignSelf)) found.push('align-self');
  return [...found, ...arranging(style)];
}

const IGNORED_ATTRS = new Set(['class', 'style', 'dir', 'data-focusable']);

function semantic(el: Element): readonly string[] {
  return [...el.attributes].map((a) => a.name).filter((name) => !IGNORED_ATTRS.has(name));
}

function hidden(style: CSSStyleDeclaration): boolean {
  if (style.display === 'none' || style.visibility === 'hidden') return true;
  return Number.parseFloat(style.opacity || '1') === 0;
}

// Elements that ARE content: they draw or take input on their own, so an empty
// one is not an empty box.
const DRAWS_ITSELF = new Set([
  'svg',
  'img',
  'canvas',
  'video',
  'input',
  'textarea',
  'select',
  'br',
  'hr',
]);

function factsOf(el: Element): Facts {
  const style = styleOf(el);
  return {
    tag: tagOf(el),
    paints: paints(style),
    layout: layout(style),
    semantic: semantic(el),
    hidden: hidden(style),
    ownText: hasOwnText(el),
    kids: kidsOf(el).length,
  };
}

/** Why this element could go, or nothing when it earns its place. A node with
 * one child that draws nothing, says nothing and shapes nothing is a
 * `passthrough`; one that only shapes is a `wrapper`, whose style a child can
 * usually take instead. The walk below says where. */
function smellOf(el: Element, facts: Facts): Omit<Smell, 'at'> | undefined {
  const structural = !facts.ownText && facts.semantic.length === 0 && !facts.paints;
  if (facts.hidden && facts.kids > 0) {
    return { kind: 'hidden-subtree', note: `${facts.kids} child branch mounted invisible` };
  }
  if (facts.kids === 0 && structural && facts.layout.length === 0 && !DRAWS_ITSELF.has(facts.tag)) {
    return { kind: 'void', note: 'no children, no text, draws nothing' };
  }
  if (facts.kids !== 1 || !structural) return undefined;
  const [child] = kidsOf(el);
  if (child && tagOf(child) === 'svg') {
    return { kind: 'glyph-wrapper', note: 'wraps one glyph; style belongs on the svg' };
  }
  if (facts.layout.length === 0) {
    return { kind: 'passthrough', note: 'one child, contributes nothing' };
  }
  return { kind: 'wrapper', note: `one child, only ${facts.layout.join(' ')}` };
}

/** The DOM cost of everything under these roots, as one figure. Pass the roots
 * a component actually mounted: its own subtree plus any portal it opened. */
function costOf(roots: readonly Element[]): Cost {
  const smells: Smell[] = [];
  let nodes = 0;
  let leaves = 0;
  let depth = 0;
  let svg = 0;
  let bytes = 0;
  for (const root of roots) {
    eachElement(root, (el, path, at) => {
      const facts = factsOf(el);
      nodes += 1;
      depth = Math.max(depth, at);
      if (facts.kids === 0) leaves += 1;
      if (facts.tag === 'svg') svg += el.querySelectorAll('*').length;
      const smell = smellOf(el, facts);
      if (smell) smells.push({ ...smell, at: path });
    });
    bytes += root.outerHTML.length;
  }
  return { nodes, leaves, overhead: nodes - leaves, depth, svg, bytes, smells };
}

export type { Cost, SmellKind };
export { costOf, factsOf };
