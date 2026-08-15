// The DOM reads the three analyzers share: what a style value means, what counts
// as a child, and how a walk names where it is.

const TRANSPARENT = new Set(['rgba(0, 0, 0, 0)', 'transparent', '']);
const EDGES = ['top', 'right', 'bottom', 'left'] as const;

type Edge = (typeof EDGES)[number];

function px(value: string): number {
  return value.endsWith('px') ? Number.parseFloat(value) : 0;
}

/** The value as written, or `''` where the property says nothing: an unset
 * property and `none` are the same absence to every analyzer here. */
function declared(value: string): string {
  return value && value !== 'none' ? value : '';
}

function positioned(style: CSSStyleDeclaration): boolean {
  return ['absolute', 'fixed', 'sticky'].includes(style.position);
}

function clips(style: CSSStyleDeclaration): boolean {
  return !['visible', ''].includes(style.overflow);
}

function tagOf(el: Element): string {
  return el.tagName.toLowerCase();
}

/** The element children, with an `<svg>` treated as one opaque leaf: what is
 * inside a glyph is the glyph, not structure a component chose. */
function kidsOf(el: Element): readonly Element[] {
  return tagOf(el) === 'svg' ? [] : [...el.children];
}

/** Whitespace IS content: the indentation in a code block is a text node, and an
 * element that renders one is not an empty box. */
function hasOwnText(el: Element): boolean {
  return [...el.childNodes].some((node) => node.nodeType === 3 && node.textContent !== '');
}

/** Every element under `root`, depth first, each with the path that names it in
 * a report and its depth below the root (the root itself is 1). */
function eachElement(
  root: Element,
  visit: (el: Element, path: string, depth: number) => void,
): void {
  const descend = (el: Element, path: string, depth: number): void => {
    visit(el, path, depth);
    const kids = kidsOf(el);
    kids.forEach((kid, index) => {
      const named = kids.length > 1 ? `${tagOf(kid)}:${index}` : tagOf(kid);
      descend(kid, `${path} > ${named}`, depth + 1);
    });
  };
  descend(root, tagOf(root), 1);
}

export type { Edge };
export {
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
};
