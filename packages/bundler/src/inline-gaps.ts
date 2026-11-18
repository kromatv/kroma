import { type GapLayout, type Gaps, NO_GAPS } from './gap-layout';

const PROPERTIES = ['gap', 'rowGap', 'columnGap'] as const;

type GapProperty = (typeof PROPERTIES)[number];

function parse(property: GapProperty, value: string, was: Gaps): Gaps {
  const [first = '', second = first] = value.trim().split(/\s+/);
  if (property === 'gap') {
    return { row: first, column: second };
  }
  return property === 'rowGap' ? { ...was, row: first } : { ...was, column: first };
}

const text = (value: unknown): string =>
  typeof value === 'string' || typeof value === 'number' ? `${value}` : '';

function patch(target: object, name: string, descriptor: PropertyDescriptor): () => void {
  const original = Object.getOwnPropertyDescriptor(target, name);
  Object.defineProperty(target, name, { configurable: true, ...descriptor });
  return () => {
    if (original) {
      Object.defineProperty(target, name, original);
    } else {
      Reflect.deleteProperty(target, name);
    }
  };
}

function styleOwners(view: Window & typeof globalThis) {
  const owners = new WeakMap<object, HTMLElement>();
  const inline = Object.getOwnPropertyDescriptor(view.HTMLElement.prototype, 'style');
  const read: unknown = inline ? Reflect.get(inline, 'get') : undefined;
  if (!inline || typeof read !== 'function') {
    return null;
  }
  const restore = patch(view.HTMLElement.prototype, 'style', {
    ...inline,
    get(this: HTMLElement): unknown {
      const style: unknown = Reflect.apply(read, this, []);
      if (typeof style === 'object' && style !== null) {
        owners.set(style, this);
      }
      return style;
    },
  });
  return { owners, restore };
}

function gapProperty(
  property: GapProperty,
  owners: WeakMap<object, HTMLElement>,
  layout: GapLayout,
) {
  return {
    get(this: object): string {
      const owner = owners.get(this);
      const set = owner ? layout.gapsOf(owner, 'inline') : NO_GAPS;
      return property === 'columnGap' ? set.column : set.row;
    },
    set(this: object, value: unknown): void {
      const owner = owners.get(this);
      if (owner) {
        const was = layout.gapsOf(owner, 'inline');
        layout.write(owner, 'inline', parse(property, text(value), was));
      }
    },
  };
}

/**
 * Hands `layout` the `gap`, `rowGap` and `columnGap` set inline on an element.
 * React writes an inline style one property at a time, and an engine without
 * flex `gap` drops those three, so the shim catches them on the way in.
 */
export function inlineGaps(doc: Document, layout: GapLayout): () => void {
  const view = doc.defaultView;
  const styles = view ? styleOwners(view) : null;
  if (!styles) {
    return () => {};
  }
  const declaration: object = Object.getPrototypeOf(doc.createElement('div').style);
  const restores = [
    styles.restore,
    ...PROPERTIES.map((property) =>
      patch(declaration, property, gapProperty(property, styles.owners, layout)),
    ),
  ];
  return () => restores.forEach((restore) => restore());
}
