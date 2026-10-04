// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { ResizableStorage } from '#ui/components/organisms/resizable';
import { clearPressGuard } from '#ui/lib/press-guard';
import { onScreen } from '#ui/testing';
import { Table, type TableColumn, type TableRootProps } from './table';

const CELL = 300;

beforeAll(() => {
  for (const side of ['offsetWidth', 'offsetHeight'] as const) {
    Object.defineProperty(HTMLElement.prototype, side, { configurable: true, get: () => CELL });
  }
  window.ResizeObserver = class {
    constructor(private readonly report: ResizeObserverCallback) {}
    observe(node: Element) {
      this.report([{ target: node } as ResizeObserverEntry], this as unknown as ResizeObserver);
    }
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

afterEach(() => {
  cleanup();
  clearPressGuard();
});

const COLUMNS: readonly TableColumn[] = [{ column: 'title' }, { column: 'player' }, {}];

async function show(props: Partial<TableRootProps> = {}) {
  render(
    onScreen(
      <Table.Root label="History" columns={COLUMNS} resizable {...props}>
        <Table.Header>
          <Table.Row>
            <Table.Cell>Title</Table.Cell>
            <Table.Cell>Player</Table.Cell>
            <Table.Cell>When</Table.Cell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          <Table.Row>
            <Table.Cell>Silo</Table.Cell>
            <Table.Cell>Chrome</Table.Cell>
            <Table.Cell>23:20</Table.Cell>
          </Table.Row>
        </Table.Body>
      </Table.Root>,
    ),
  );
  await act(async () => {
    await new Promise((settled) => setTimeout(settled, 0));
  });
}

function mouse(kind: string, node: Element, init: MouseEventInit, stamp: number) {
  const event = new MouseEvent(kind, { bubbles: true, cancelable: true, ...init });
  Object.defineProperty(event, 'timeStamp', { value: stamp });
  fireEvent(node, event);
}

function drag(seam: string, by: number) {
  const strip = screen.getByLabelText(seam).parentElement as HTMLElement;
  const claimed = Math.sign(by) * 6;
  mouse('mousedown', strip, { clientX: 100, clientY: 100, button: 0 }, 1000);
  mouse('mousemove', strip, { clientX: 100 + claimed, clientY: 100, buttons: 1 }, 1010);
  mouse('mousemove', document.body, { clientX: 100 + by, clientY: 100, buttons: 1 }, 1020);
  mouse('mouseup', document.body, { clientX: 100 + by, clientY: 100 }, 1030);
}

const share = (seam: string) => screen.getByLabelText(seam).getAttribute('aria-valuenow');

const bases = () =>
  screen.getAllByRole('columnheader').map((heading) => heading.style.flexBasis || 'declared');

function memoryStore(): ResizableStorage & { held: Map<string, string> } {
  const held = new Map<string, string>();
  return {
    held,
    getItem: (key) => held.get(key) ?? null,
    setItem: (key, value) => {
      held.set(key, value);
    },
  };
}

describe('<Table resizable>', () => {
  it('draws a seam after every heading but the last, named for its column', async () => {
    await show();

    expect(screen.getAllByRole('slider').map((seam) => seam.getAttribute('aria-label'))).toEqual([
      'Title',
      'Player',
    ]);
  });

  it('draws no seam on a table that does not ask for them', async () => {
    await show({ resizable: false });

    expect(screen.queryAllByRole('slider')).toHaveLength(0);
  });

  it('announces the share of the width each column holds', async () => {
    await show();

    expect(share('Title')).toBe('33');
  });

  it('moves the boundary with the pointer and leaves the columns beyond it alone', async () => {
    await show();

    drag('Title', 96);

    expect(share('Title')).toBe('43');
    expect(share('Player')).toBe('23');
    expect(bases()).toEqual(['43.333%', '23.333%', '33.333%']);
  });

  it('stops where the column it takes from reaches its floor', async () => {
    await show({ columns: [{ column: 'title' }, { column: 'player', min: 240 }, {}] });

    drag('Title', 400);

    expect(share('Player')).toBe('27');
  });

  it('takes the arrow keys once a seam is pressed, and moves on them', async () => {
    await show();

    fireEvent.click(screen.getByLabelText('Player'));
    fireEvent.keyDown(document, { key: 'ArrowLeft' });

    expect(share('Player')).toBe('31');
  });

  it('gives every column back the width it was declared with on a second press', async () => {
    await show();
    fireEvent.click(screen.getByLabelText('Title'));
    fireEvent.keyDown(document, { key: 'ArrowRight' });

    fireEvent.click(screen.getByLabelText('Title'));

    expect(bases()).toEqual(['declared', 'declared', 'declared']);
  });

  it('keeps the widths under the set of columns the window draws', async () => {
    const store = memoryStore();
    await show({ autoSaveId: 'history', storage: store });

    drag('Title', 96);

    expect(store.held.get('history')).toBe(JSON.stringify({ '0,1,2': [43.333, 23.333, 33.333] }));
  });

  it('opens on the widths the last visit left', async () => {
    const store = memoryStore();
    store.held.set('history', JSON.stringify({ '0,1,2': [50, 20, 30] }));

    await show({ autoSaveId: 'history', storage: store });

    expect(share('Title')).toBe('50');
    expect(bases()).toEqual(['50%', '20%', '30%']);
  });

  it('forgets the stored widths once they are given back', async () => {
    const store = memoryStore();
    store.held.set('history', JSON.stringify({ '0,1,2': [50, 20, 30] }));
    await show({ autoSaveId: 'history', storage: store });

    fireEvent.click(screen.getByLabelText('Title'));
    fireEvent.click(screen.getByLabelText('Title'));

    expect(store.held.get('history')).toBe(JSON.stringify({ '0,1,2': [] }));
  });
});
