// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { suppressSelection } from './drag-select';

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute('style');
});

describe('suppressSelection', () => {
  it('stops the document selecting, and restores what was there before', () => {
    const style = document.documentElement.style as CSSStyleDeclaration & {
      webkitUserSelect?: string;
    };
    style.userSelect = 'text';
    style.webkitUserSelect = 'text';

    const undo = suppressSelection();
    expect(style.userSelect).toBe('none');
    expect(style.webkitUserSelect).toBe('none');

    undo();
    expect(style.userSelect).toBe('text');
    expect(style.webkitUserSelect).toBe('text');
  });

  it('clears the range the press that started the drag already caught', () => {
    const removeAllRanges = vi.fn();
    vi.spyOn(window, 'getSelection').mockReturnValue({ removeAllRanges } as never);
    suppressSelection()();
    expect(removeAllRanges).toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('is a no-op where there is no window', () => {
    vi.stubGlobal('window', undefined);
    expect(() => suppressSelection()()).not.toThrow();
  });

  it('is a no-op on a window carrying no document element', () => {
    vi.stubGlobal('window', { addEventListener: () => {} });
    expect(() => suppressSelection()()).not.toThrow();
  });
});
