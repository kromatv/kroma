// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { createGapLayout, type Flow, flexGapWorks, type GapReaders } from './gap-layout';

const settled = () => new Promise((resolve) => setTimeout(resolve, 50));
const undo: Array<() => void> = [];

afterEach(() => {
  undo.splice(0).forEach((step) => step());
  document.body.innerHTML = '';
});

function container(): HTMLElement {
  const made = document.createElement('div');
  made.append(document.createElement('div'), document.createElement('div'));
  document.body.appendChild(made);
  return made;
}

function rulesFor(element: Element): string {
  const key = element.getAttribute('data-kroma-gap');
  return Array.from(document.styleSheets)
    .flatMap((sheet) => Array.from(sheet.cssRules))
    .map((rule) => rule.cssText)
    .filter((text) => key !== null && text.includes(`[data-kroma-gap="${key}"]`))
    .join(' ');
}

function reading(flow: Flow): GapReaders {
  return { flow: () => flow, inFlow: () => true };
}

function layout(readers?: GapReaders) {
  const made = createGapLayout(document, readers);
  undo.push(() => made.dispose());
  return made;
}

describe('createGapLayout', () => {
  it('reads the flow and the children from the computed style by default', async () => {
    const row = container();
    row.style.flexDirection = 'row';
    const floating = document.createElement('div');
    floating.style.position = 'absolute';
    row.appendChild(floating);

    layout().write(row, 'inline', { row: '8px', column: '8px' });
    await settled();

    expect(rulesFor(row)).toContain('margin-left: 8px');
    expect(floating.hasAttribute('data-kroma-gap-skip')).toBe(true);
  });

  it('spaces a reversed column on its bottom edge', async () => {
    const column = container();

    layout(reading({ direction: 'column-reverse', wrap: false })).write(column, 'class', {
      row: '6px',
      column: '',
    });
    await settled();

    expect(rulesFor(column)).toContain('margin-bottom: 6px');
  });

  it('falls back to the top edge for a direction it does not know', async () => {
    const box = container();

    layout(reading({ direction: '', wrap: false })).write(box, 'class', {
      row: '4px',
      column: '4px',
    });
    await settled();

    expect(rulesFor(box)).toContain('margin-top: 4px');
  });

  it('halves a gap that is not in pixels with calc', async () => {
    const grid = container();

    layout(reading({ direction: 'row', wrap: true })).write(grid, 'class', {
      row: '1em',
      column: '',
    });
    await settled();

    expect(rulesFor(grid)).toContain('calc(-0.5em)');
  });

  it('lets an inline gap win over the gap of a class', async () => {
    const row = container();
    const gaps = layout(reading({ direction: 'row', wrap: false }));

    gaps.write(row, 'class', { row: '4px', column: '4px' });
    gaps.write(row, 'inline', { row: '20px', column: '20px' });
    await settled();

    expect(rulesFor(row)).toContain('margin-left: 20px');
    expect(gaps.gapsOf(row, 'class').column).toBe('4px');
  });

  it('respaces a container whose gap changed', async () => {
    const row = container();
    const gaps = layout(reading({ direction: 'row', wrap: false }));
    gaps.write(row, 'inline', { row: '4px', column: '4px' });
    await settled();

    gaps.write(row, 'inline', { row: '10px', column: '10px' });
    await settled();

    expect(rulesFor(row)).toContain('margin-left: 10px');
  });

  it('does nothing in a document without a window', async () => {
    const detached = document.implementation.createHTMLDocument('');
    const box = detached.createElement('div');
    detached.body.appendChild(box);
    const gaps = createGapLayout(detached);

    gaps.write(box, 'inline', { row: '4px', column: '4px' });
    await settled();
    gaps.dispose();

    expect(box.hasAttribute('data-kroma-gap')).toBe(false);
  });
});

describe('flexGapWorks', () => {
  it('reports no flex gap where nothing is laid out', () => {
    expect(flexGapWorks(document)).toBe(false);
  });
});
