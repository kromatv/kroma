// @vitest-environment jsdom

import { act } from '@testing-library/react';
import { hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { Dimensions } from 'react-native';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KitProvider } from '#ui/configure';
import { createStyleTestHost } from '#ui/testing-style';
import { breakpointAt, stepsReached } from './breakpoint-cascade';

const { writeMode } = createStyleTestHost();
let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
  writeMode('system');
  vi.restoreAllMocks();
});

const page = (
  <KitProvider config={{}}>
    <span>Bibliothèque</span>
  </KitProvider>
);

function served(html: string): HTMLElement {
  const container = document.createElement('div');
  container.innerHTML = html;
  document.body.append(container);
  return container;
}

function windowless(): string {
  const get = vi.spyOn(Dimensions, 'get').mockReturnValue({ ...WINDOW, width: 0 });
  const html = renderToString(page);
  get.mockRestore();
  return html;
}

const WINDOW = { width: 1440, height: 900, scale: 1, fontScale: 1 };

const host = (container: HTMLElement) => container.querySelector('[data-kroma-theme]');

describe('a styling root hydrating over what the server sent', () => {
  it("moves to the visitor's breakpoint without a mismatch", async () => {
    const container = served(windowless());
    vi.spyOn(Dimensions, 'get').mockReturnValue(WINDOW);
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});

    await act(async () => {
      root = hydrateRoot(container, page);
    });

    expect(host(container)?.getAttribute('data-kroma-bp')).toBe(
      stepsReached(breakpointAt(WINDOW.width)),
    );
    expect(errors).not.toHaveBeenCalled();
  });

  it("takes the visitor's stored ground without a mismatch", async () => {
    const container = served(windowless());
    writeMode('light');
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});

    await act(async () => {
      root = hydrateRoot(container, page);
    });

    expect(host(container)?.getAttribute('data-theme')).toBe('light');
    expect(errors).not.toHaveBeenCalled();
  });
});
