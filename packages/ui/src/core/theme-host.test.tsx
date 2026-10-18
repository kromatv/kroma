// @vitest-environment jsdom

import { act, render } from '@testing-library/react';
import { hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { Dimensions } from 'react-native';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KitProvider } from '#ui/configure';
import { createStyleTestHost } from '#ui/testing-style';
import { breakpointAt, stepsReached } from './breakpoint-cascade';
import { useStyleRuntime } from './style-context';
import type { StyleRuntime } from './style-runtime';

const { writeMode } = createStyleTestHost();
let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
  document.documentElement.removeAttribute('data-theme');
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

function Runtime({ into }: Readonly<{ into: { runtime?: StyleRuntime } }>) {
  into.runtime = useStyleRuntime();
  return null;
}

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

describe("the document's ground", () => {
  it('follows the outermost root', () => {
    render(
      <KitProvider config={{ ground: 'light' }}>
        <span>Bibliothèque</span>
      </KitProvider>,
    );

    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('is left alone by a root nested inside another', () => {
    render(
      <KitProvider config={{ ground: 'dark' }}>
        <KitProvider config={{ ground: 'light' }}>
          <span>Aperçu</span>
        </KitProvider>
      </KitProvider>,
    );

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('is let go when the root goes back to following the system', () => {
    const held: { runtime?: StyleRuntime } = {};
    document.documentElement.setAttribute('data-theme', 'dark');
    render(
      <KitProvider config={{ ground: 'dark' }}>
        <Runtime into={held} />
      </KitProvider>,
    );

    act(() => held.runtime?.setMode('system'));

    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });
});
