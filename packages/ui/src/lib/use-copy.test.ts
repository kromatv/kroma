// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCopy } from './use-copy';

function withClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(window.navigator, 'clipboard', {
    value: { writeText: vi.fn(writeText) },
    configurable: true,
  });
  return window.navigator.clipboard.writeText as ReturnType<typeof vi.fn>;
}

function withoutClipboard() {
  Object.defineProperty(window.navigator, 'clipboard', {
    value: undefined,
    configurable: true,
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  withoutClipboard();
});

describe('useCopy', () => {
  it('reports the platform has no clipboard, so the control renders nothing at all', () => {
    withoutClipboard();
    const { result } = renderHook(useCopy);
    expect(result.current.available).toBe(false);
  });

  it('writes the text and confirms, then goes back to resting on its own', async () => {
    const writeText = withClipboard(async () => undefined);
    const { result } = renderHook(useCopy);
    expect(result.current.available).toBe(true);

    await act(async () => {
      result.current.copy('npm i @kroma/ui');
    });
    expect(writeText).toHaveBeenCalledWith('npm i @kroma/ui');
    expect(result.current.state).toBe('copied');

    act(() => {
      vi.advanceTimersByTime(1200);
    });
    expect(result.current.state).toBe('idle');
  });

  it('says so when the platform refuses the write, rather than looking like a no-op', async () => {
    withClipboard(async () => {
      throw new Error('NotAllowedError');
    });
    const { result } = renderHook(useCopy);
    await act(async () => {
      result.current.copy('text');
    });
    expect(result.current.state).toBe('failed');
  });

  it('does not block a second copy behind the first tick', async () => {
    withClipboard(async () => undefined);
    const { result } = renderHook(useCopy);
    await act(async () => {
      result.current.copy('one');
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    await act(async () => {
      result.current.copy('two');
    });
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(result.current.state).toBe('copied');
  });

  it('does nothing at all for empty text or with no clipboard', async () => {
    const writeText = withClipboard(async () => undefined);
    const { result } = renderHook(useCopy);
    await act(async () => {
      result.current.copy(undefined);
      result.current.copy('');
    });
    expect(writeText).not.toHaveBeenCalled();
    expect(result.current.state).toBe('idle');

    withoutClipboard();
    const offline = renderHook(useCopy);
    await act(async () => {
      offline.result.current.copy('text');
    });
    expect(offline.result.current.state).toBe('idle');
  });

  it('drops its pending tick on unmount rather than setting state on a dead hook', async () => {
    withClipboard(async () => undefined);
    const view = renderHook(useCopy);
    await act(async () => {
      view.result.current.copy('text');
    });
    view.unmount();
    expect(() =>
      act(() => {
        vi.advanceTimersByTime(5000);
      }),
    ).not.toThrow();
  });
});
