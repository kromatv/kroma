// Chromium draws an outline square below 94: the rounded one landed for
// crbug.com/81556 at main #906586, after the M93 branch point. This is the same
// ring as the declarations of a pseudo-element, whose corners can be rounded.

const UNPSEUDOED = new Set(['IMG', 'INPUT', 'TEXTAREA', 'SELECT', 'VIDEO', 'IFRAME', 'CANVAS']);

type Four<T> = readonly [T, T, T, T];

/** What an element's computed style says about its outline and its corners. */
export interface OutlineBox {
  outlineStyle: string;
  outlineWidth: number;
  outlineOffset: number;
  outlineColor: string;
  cornerRadii: Four<string>;
  borderWidths: Four<number>;
  hostsPseudo: boolean;
}

const px = (value: string): number => Number.parseFloat(value) || 0;

/** Reads an element's outline, corners and borders from its computed style. A
 * replaced element, a static one and one that clips its overflow cannot carry
 * a ring outside its own box, which `hostsPseudo` says. */
export function readOutlineBox(element: Element, style: CSSStyleDeclaration): OutlineBox {
  return {
    outlineStyle: style.outlineStyle,
    outlineWidth: px(style.outlineWidth),
    outlineOffset: px(style.outlineOffset),
    outlineColor: style.outlineColor,
    cornerRadii: [
      style.borderTopLeftRadius,
      style.borderTopRightRadius,
      style.borderBottomRightRadius,
      style.borderBottomLeftRadius,
    ],
    borderWidths: [
      px(style.borderTopWidth),
      px(style.borderRightWidth),
      px(style.borderBottomWidth),
      px(style.borderLeftWidth),
    ],
    hostsPseudo:
      !UNPSEUDOED.has(element.tagName) &&
      style.position !== 'static' &&
      style.overflowX === 'visible' &&
      style.overflowY === 'visible',
  };
}

function grow(radius: string, by: number): string {
  return radius
    .split(' ')
    .map((part) => {
      if (!part.endsWith('px')) {
        return part;
      }
      const length = px(part);
      return length > 0 ? `${Math.max(0, length + by)}px` : '0px';
    })
    .join(' ');
}

function needsRing(box: OutlineBox): boolean {
  const drawn = box.outlineStyle !== 'none' && box.outlineStyle !== 'auto' && box.outlineWidth > 0;
  return drawn && box.hostsPseudo && box.cornerRadii.some((radius) => px(radius) > 0);
}

/**
 * The declarations of a pseudo-element that paints `box`'s outline with its
 * corners following the element's own, concentric with them; null where the
 * engine's outline is already right (square corners, no outline) or where no
 * pseudo-element can stand outside the box.
 */
export function ringDeclarations(box: OutlineBox): string | null {
  if (!needsRing(box)) {
    return null;
  }
  const reach = box.outlineOffset + box.outlineWidth;
  const inset = (border: number) => `${0 - reach - border}px`;
  const corner = (radius: string) => grow(radius, reach);
  const [top, right, bottom, left] = box.borderWidths;
  const [topLeft, topRight, bottomRight, bottomLeft] = box.cornerRadii;
  return [
    'content:""',
    'position:absolute',
    'z-index:auto',
    'pointer-events:none',
    'box-sizing:border-box',
    `top:${inset(top)}`,
    `right:${inset(right)}`,
    `bottom:${inset(bottom)}`,
    `left:${inset(left)}`,
    `border:${box.outlineWidth}px ${box.outlineStyle} ${box.outlineColor}`,
    `border-top-left-radius:${corner(topLeft)}`,
    `border-top-right-radius:${corner(topRight)}`,
    `border-bottom-right-radius:${corner(bottomRight)}`,
    `border-bottom-left-radius:${corner(bottomLeft)}`,
  ].join(';');
}
