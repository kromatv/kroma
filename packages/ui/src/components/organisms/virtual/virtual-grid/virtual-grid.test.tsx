// @vitest-environment jsdom

import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { Box } from '#ui/components/atoms/box';
import { Focusable } from '#ui/components/atoms/focusable';
import { layout, onScreen } from '#ui/testing';
import { VirtualGrid } from './virtual-grid';

const TILES = Array.from({ length: 60 }, (_, at) => ({ id: at }));

const draw = (ui: ReactElement) => render(onScreen(ui));

function grid(width?: number) {
  return (
    <VirtualGrid
      data={TILES}
      min={200}
      ratio={3 / 2}
      gap={24}
      px={64}
      width={width}
      style={{ height: 600 }}
      renderItem={(item, _index, cell) => (
        <Focusable label={`tile ${item.id}`} style={{ width: cell }}>
          <Box style={{ width: cell, height: 10 }} />
        </Focusable>
      )}
    />
  );
}

const tileWidth = (root: HTMLElement) =>
  getComputedStyle(root.querySelector('[role="button"]') as HTMLElement).width;

describe('VirtualGrid', () => {
  it('draws the width it was handed until it has measured its own box', () => {
    const { container } = draw(grid(1920));
    // 1792 of content, 8 x 200-and-up columns, 24px gaps.
    expect(tileWidth(container)).toBe('203px');
  });

  it('has no columns to draw without one', () => {
    const { container } = draw(grid());
    expect(container.querySelector('[role="button"]')).toBeNull();
  });

  it('re-fills into the box it measures, and hands each tile its cell', () => {
    const { container } = draw(grid(1920));
    const viewport = container.firstElementChild as HTMLElement;

    layout(viewport, { width: 1400 });
    // 1272 of content: 5 columns of 235, not 8 columns off the right edge.
    expect(tileWidth(container)).toBe('235px');

    layout(viewport, { width: 2560 });
    expect(tileWidth(container)).toBe('221px');
  });

  it('keeps a fixed column count when the design demands one', () => {
    const { container } = render(
      onScreen(
        <VirtualGrid
          data={TILES}
          columns={4}
          ratio={3 / 2}
          gap={24}
          width={1920}
          style={{ height: 600 }}
          renderItem={(item, _index, cell) => (
            <Focusable label={`tile ${item.id}`} style={{ width: cell }}>
              <Box style={{ width: cell, height: 10 }} />
            </Focusable>
          )}
        />,
      ),
    );
    const viewport = container.firstElementChild as HTMLElement;
    layout(viewport, { width: 1400 });
    // (1400 - 3 x 24) / 4, still four across.
    expect(tileWidth(container)).toBe('332px');
  });
});
