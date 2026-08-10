// @vitest-environment jsdom
//
// The 1-D focus every player panel navigates with (Quality, Audio, Speed,
// Subtitles, the appearance rows, the AI-gen wizard).

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useListFocus } from './useListFocus';

describe('vertical (the default)', () => {
  it('starts at the top, or wherever it is told to', () => {
    expect(renderHook(() => useListFocus({ count: 3 })).result.current.index).toBe(0);
    expect(renderHook(() => useListFocus({ count: 3, initial: 2 })).result.current.index).toBe(2);
  });

  it('walks the rows with up and down', () => {
    const { result } = renderHook(() => useListFocus({ count: 3 }));
    act(() => void result.current.onKey('Down'));
    expect(result.current.index).toBe(1);
    act(() => void result.current.onKey('Up'));
    expect(result.current.index).toBe(0);
  });

  // No `onExit`: the key is NOT consumed, so the shell gets it. That is what
  // lets ▲ off the top of a panel close the panel.
  it('does not consume a move off the edge when nobody handles the exit', () => {
    const { result } = renderHook(() => useListFocus({ count: 2 }));
    let consumed = true;
    act(() => {
      consumed = result.current.onKey('Up');
    });
    expect(consumed).toBe(false);
    expect(result.current.index).toBe(0);
  });

  it('reports which edge it left by', () => {
    const onExit = vi.fn();
    const { result } = renderHook(() => useListFocus({ count: 2, onExit }));
    act(() => void result.current.onKey('Up'));
    expect(onExit).toHaveBeenLastCalledWith('before');
    act(() => void result.current.onKey('Down'));
    act(() => void result.current.onKey('Down'));
    expect(onExit).toHaveBeenLastCalledWith('after');
  });

  it('sends left/right to the value handler when there is one', () => {
    const onHorizontal = vi.fn();
    const { result } = renderHook(() => useListFocus({ count: 3, initial: 1, onHorizontal }));
    let consumed = false;
    act(() => {
      consumed = result.current.onKey('Right');
    });
    expect(onHorizontal).toHaveBeenCalledWith(1, 1);
    expect(consumed).toBe(true);
    act(() => void result.current.onKey('Left'));
    expect(onHorizontal).toHaveBeenLastCalledWith(1, -1);
  });

  // A list with no value to adjust treats ◀▶ as leaving the surface, which is
  // how a sub-panel returns to the menu beside it.
  it('treats left/right as an exit when no value handler is given', () => {
    const onExit = vi.fn();
    const { result } = renderHook(() => useListFocus({ count: 3, onExit }));
    act(() => void result.current.onKey('Left'));
    expect(onExit).toHaveBeenCalledWith('before');
    act(() => void result.current.onKey('Right'));
    expect(onExit).toHaveBeenLastCalledWith('after');
  });
});

describe('horizontal', () => {
  it('walks with left and right instead', () => {
    const { result } = renderHook(() =>
      useListFocus({ count: 3, orientation: 'horizontal', initial: 1 }),
    );
    act(() => void result.current.onKey('Right'));
    expect(result.current.index).toBe(2);
    act(() => void result.current.onKey('Left'));
    expect(result.current.index).toBe(1);
  });

  it('leaves the surface on up and down', () => {
    const onExit = vi.fn();
    const { result } = renderHook(() =>
      useListFocus({ count: 3, orientation: 'horizontal', onExit }),
    );
    act(() => void result.current.onKey('Up'));
    expect(onExit).toHaveBeenCalledWith('before');
    act(() => void result.current.onKey('Down'));
    expect(onExit).toHaveBeenLastCalledWith('after');
  });
});

describe('activate and back', () => {
  it('activates the focused row', () => {
    const onActivate = vi.fn();
    const { result } = renderHook(() => useListFocus({ count: 3, initial: 2, onActivate }));
    let consumed = false;
    act(() => {
      consumed = result.current.onKey('Enter');
    });
    expect(onActivate).toHaveBeenCalledWith(2);
    expect(consumed).toBe(true);
  });

  it('calls back', () => {
    const onBack = vi.fn();
    const { result } = renderHook(() => useListFocus({ count: 3, onBack }));
    act(() => void result.current.onKey('Back'));
    expect(onBack).toHaveBeenCalled();
  });

  it('consumes neither when nobody is listening', () => {
    const { result } = renderHook(() => useListFocus({ count: 3 }));
    let enter = true;
    let back = true;
    act(() => {
      enter = result.current.onKey('Enter');
      back = result.current.onKey('Back');
    });
    expect(enter).toBe(false);
    expect(back).toBe(false);
  });

  it('ignores a key it knows nothing about', () => {
    const { result } = renderHook(() => useListFocus({ count: 3 }));
    let consumed = true;
    act(() => {
      consumed = result.current.onKey('Play' as never);
    });
    expect(consumed).toBe(false);
  });
});

describe('the header above the list', () => {
  // Without this the panel's Back button is pointer-only: a remote can light it
  // (index -1) but pressing OK there does nothing.
  it('runs the header on OK while the header holds the focus', () => {
    const header = vi.fn();
    const onActivate = vi.fn();
    const { result } = renderHook(() => useListFocus({ count: 3, header, onActivate }));
    act(() => void result.current.onKey('Up'));
    expect(result.current.index).toBe(-1);
    let consumed = false;
    act(() => {
      consumed = result.current.onKey('Enter');
    });
    expect(header).toHaveBeenCalledTimes(1);
    expect(onActivate).not.toHaveBeenCalled();
    expect(consumed).toBe(true);
  });

  it('does not consume OK at the header when there is no header to run', () => {
    const { result } = renderHook(() => useListFocus({ count: 3, onExit: () => undefined }));
    act(() => result.current.setIndex(-1));
    let consumed = true;
    act(() => {
      consumed = result.current.onKey('Enter');
    });
    expect(consumed).toBe(false);
  });
});

describe('pointer', () => {
  // §15: the mouse moves the same focus the remote does, so a hover and a
  // D-pad move cannot disagree about which row is lit.
  it('moves focus on hover', () => {
    const { result } = renderHook(() => useListFocus({ count: 4 }));
    act(() => result.current.hover(3)());
    expect(result.current.index).toBe(3);
  });

  it('can be driven directly', () => {
    const { result } = renderHook(() => useListFocus({ count: 4 }));
    act(() => result.current.setIndex(2));
    expect(result.current.index).toBe(2);
  });
});
