// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { createGapLayout, type Flow, type GapReaders } from './gap-layout';
import { inlineGaps } from './inline-gaps';

const ROW: Flow = { direction: 'row', wrap: false };

function readers(flow: Flow): GapReaders {
  return {
    flow: () => flow,
    inFlow: (element) => !element.classList.contains('floating'),
  };
}

const undo: Array<() => void> = [];

function install(reading: GapReaders): () => void {
  const layout = createGapLayout(document, reading);
  const restore = inlineGaps(document, layout);
  return () => {
    restore();
    layout.dispose();
  };
}

afterEach(() => {
  undo.splice(0).forEach((step) => step());
  document.body.innerHTML = '';
});

function container(children: string[]): HTMLElement {
  const element = document.createElement('div');
  for (const name of children) {
    const child = document.createElement('div');
    child.className = name;
    element.appendChild(child);
  }
  document.body.appendChild(element);
  return element;
}

const settled = () => new Promise((resolve) => setTimeout(resolve, 50));

function rulesFor(element: Element): string[] {
  const key = element.getAttribute('data-kroma-gap');
  return Array.from(document.styleSheets)
    .flatMap((sheet) => Array.from(sheet.cssRules))
    .map((rule) => rule.cssText)
    .filter((text) => key !== null && text.includes(`[data-kroma-gap="${key}"]`));
}

describe('inlineGaps', () => {
  it('spaces a row by its inline gap, between siblings only', async () => {
    undo.push(install(readers(ROW)));
    const row = container(['a', 'b']);

    row.style.gap = '16px';
    await settled();

    expect(rulesFor(row).join(' ')).toContain('margin-left: 16px');
    expect(row.style.gap).toBe('16px');
  });

  it('spaces a column by its row gap, on the top edge', async () => {
    undo.push(install(readers({ direction: 'column', wrap: false })));
    const column = container(['a', 'b']);

    column.style.rowGap = '8px';
    await settled();

    expect(rulesFor(column).join(' ')).toContain('margin-top: 8px');
  });

  it('pulls a wrapping row in by half its gaps and pushes each child out by as much', async () => {
    undo.push(install(readers({ direction: 'row', wrap: true })));
    const grid = container(['a', 'b', 'c']);

    grid.style.gap = '12px 24px';
    await settled();

    const rules = rulesFor(grid).join(' ');
    expect(rules).toContain('margin: -6px -12px');
    expect(rules).toContain('margin: 6px 12px');
  });

  it('skips a child out of the flow, as gap does', async () => {
    undo.push(install(readers(ROW)));
    const row = container(['floating', 'a', 'b']);

    row.style.columnGap = '10px';
    await settled();

    expect(row.children[0]?.hasAttribute('data-kroma-gap-skip')).toBe(true);
    expect(row.children[1]?.hasAttribute('data-kroma-gap-skip')).toBe(false);
  });

  it('marks a child added after the gap was set', async () => {
    undo.push(install(readers(ROW)));
    const row = container(['a']);
    row.style.gap = '10px';
    await settled();

    const late = document.createElement('div');
    late.className = 'floating';
    row.appendChild(late);
    await settled();

    expect(late.hasAttribute('data-kroma-gap-skip')).toBe(true);
  });

  it('lets go of a container whose gap was cleared', async () => {
    undo.push(install(readers(ROW)));
    const row = container(['a', 'b']);
    row.style.gap = '16px';
    await settled();

    row.style.gap = '';
    await settled();

    expect(row.hasAttribute('data-kroma-gap')).toBe(false);
  });

  it('shares one rule between containers with the same gap', async () => {
    undo.push(install(readers(ROW)));
    const one = container(['a', 'b']);
    const two = container(['a', 'b']);

    one.style.gap = '16px';
    two.style.gap = '16px';
    await settled();

    expect(one.getAttribute('data-kroma-gap')).toBe(two.getAttribute('data-kroma-gap'));
  });

  it('waits for a container built off the page before reading its flow', async () => {
    const flows: string[] = [];
    const reading: GapReaders = {
      flow: (element) => {
        flows.push(element.isConnected ? 'attached' : 'detached');
        return ROW;
      },
      inFlow: () => true,
    };
    undo.push(install(reading));
    const row = document.createElement('div');
    row.style.gap = '16px';
    await settled();

    document.body.appendChild(row);
    await settled();

    expect(flows).toEqual(['attached']);
    expect(row.hasAttribute('data-kroma-gap')).toBe(true);
  });

  it('puts the engine back as it found it once disposed', () => {
    const before = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'style');

    install(readers(ROW))();

    expect(Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'style')).toEqual(before);
  });
});
