// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { classGaps } from './class-gaps';
import { createGapLayout, type GapReaders } from './gap-layout';

const ROW: GapReaders = {
  flow: () => ({ direction: 'row', wrap: false }),
  inFlow: () => true,
};

const undo: Array<() => void> = [];

afterEach(() => {
  undo.splice(0).forEach((step) => step());
  document.body.innerHTML = '';
});

function install(css: string): HTMLStyleElement {
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
  const layout = createGapLayout(document, ROW);
  const sheets = () => (style.sheet ? [style.sheet] : []);
  const stop = classGaps(document, layout, sheets);
  undo.push(
    stop,
    () => layout.dispose(),
    () => style.remove(),
  );
  return style;
}

const settled = () => new Promise((resolve) => setTimeout(resolve, 50));

function element(className: string): HTMLElement {
  const made = document.createElement('div');
  made.className = className;
  made.appendChild(document.createElement('div'));
  made.appendChild(document.createElement('div'));
  return made;
}

describe('classGaps', () => {
  it('spaces an element that mounts wearing a marked class', async () => {
    install('.row{gap:16px}.row[data-kroma-gap-static="16px|16px"]{order:0}');
    const row = element('row');

    document.body.appendChild(row);
    await settled();

    expect(row.hasAttribute('data-kroma-gap')).toBe(true);
  });

  it('spaces the marked descendants of a subtree mounted at once', async () => {
    install('.row{gap:16px}.row[data-kroma-gap-static="16px|16px"]{order:0}');
    const tree = document.createElement('section');
    const row = element('row');
    tree.appendChild(row);

    document.body.appendChild(tree);
    await settled();

    expect(row.hasAttribute('data-kroma-gap')).toBe(true);
  });

  it('lets go of an element that drops the class', async () => {
    install('.row{gap:16px}.row[data-kroma-gap-static="16px|16px"]{order:0}');
    const row = element('row');
    document.body.appendChild(row);
    await settled();

    row.className = 'other';
    await settled();

    expect(row.hasAttribute('data-kroma-gap')).toBe(false);
  });

  it('reads a marker a minifier merged into a selector list', async () => {
    install('.a[data-kroma-gap-static="8px|"],.b[data-kroma-gap-static="|12px"]{order:0}');
    const a = element('a');
    const b = element('b');

    document.body.append(a, b);
    await settled();

    expect(a.hasAttribute('data-kroma-gap')).toBe(true);
    expect(b.hasAttribute('data-kroma-gap')).toBe(true);
  });

  it('leaves alone an element whose classes carry no gap', async () => {
    install('.row{gap:16px}.row[data-kroma-gap-static="16px|16px"]{order:0}');
    const plain = element('plain');

    document.body.appendChild(plain);
    await settled();

    expect(plain.hasAttribute('data-kroma-gap')).toBe(false);
  });

  it('spaces an element mounted after the first one, once the classes are known', async () => {
    install('.row{gap:16px}.row[data-kroma-gap-static="16px|16px"]{order:0}');
    document.body.appendChild(element('row'));
    await settled();
    const later = element('row');

    document.body.append('a text node', later);
    await settled();

    expect(later.hasAttribute('data-kroma-gap')).toBe(true);
  });

  it('skips the rules that are not style rules', async () => {
    install('@media screen{.wide{gap:4px}}.row[data-kroma-gap-static="16px|16px"]{order:0}');
    const row = element('row');

    document.body.appendChild(row);
    await settled();

    expect(row.hasAttribute('data-kroma-gap')).toBe(true);
  });

  it('leaves alone an SVG element wearing a marked class', async () => {
    install('.row[data-kroma-gap-static="16px|16px"]{order:0}');
    const drawing = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    drawing.setAttribute('class', 'row');

    document.body.appendChild(drawing);
    await settled();

    expect(drawing.hasAttribute('data-kroma-gap')).toBe(false);
  });

  it('reads only linked stylesheets unless told otherwise', async () => {
    const style = document.createElement('style');
    style.textContent = '.row[data-kroma-gap-static="16px|16px"]{order:0}';
    document.head.appendChild(style);
    const layout = createGapLayout(document, ROW);
    undo.push(
      classGaps(document, layout),
      () => layout.dispose(),
      () => style.remove(),
    );
    const row = element('row');

    document.body.appendChild(row);
    await settled();

    expect(row.hasAttribute('data-kroma-gap')).toBe(false);
  });
});
