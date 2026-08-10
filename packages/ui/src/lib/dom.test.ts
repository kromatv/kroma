// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { webDocument, webWindow } from './dom';

afterEach(() => vi.unstubAllGlobals());

describe('webDocument', () => {
  it('is the document in a browser, and null where there is none', () => {
    expect(webDocument()).toBe(document);
    vi.stubGlobal('document', undefined);
    expect(webDocument()).toBeNull();
  });
});

describe('webWindow', () => {
  it('is the window in a browser', () => {
    expect(webWindow()).toBe(window);
  });

  it('is null where `window` exists but carries no DOM event API', () => {
    vi.stubGlobal('window', { document: {} });
    expect(webWindow()).toBeNull();
  });

  it('is null where there is no window at all', () => {
    vi.stubGlobal('window', undefined);
    expect(webWindow()).toBeNull();
  });
});
