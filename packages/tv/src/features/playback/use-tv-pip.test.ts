// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useTvPip } from './use-tv-pip';

function view() {
  return {
    startPictureInPicture: vi.fn(() => Promise.resolve()),
    stopPictureInPicture: vi.fn(() => Promise.resolve()),
  };
}

describe('picture-in-picture on a television', () => {
  it('asks the attached view to open the window', () => {
    const handle = view();
    const { result } = renderHook(() => useTvPip(vi.fn(), vi.fn()));

    act(() => result.current.binding.attach(handle));
    act(() => result.current.toggle());

    expect(handle.startPictureInPicture).toHaveBeenCalledOnce();
    expect(handle.stopPictureInPicture).not.toHaveBeenCalled();
  });

  it('turns active only once the system says the window opened', () => {
    const onStart = vi.fn();
    const { result } = renderHook(() => useTvPip(onStart, vi.fn()));

    act(() => result.current.binding.onStart());

    expect(result.current.active).toBe(true);
    expect(onStart).toHaveBeenCalledOnce();
  });

  it('closes an open window from the toggle', () => {
    const handle = view();
    const { result } = renderHook(() => useTvPip(vi.fn(), vi.fn()));
    act(() => result.current.binding.attach(handle));
    act(() => result.current.binding.onStart());

    act(() => result.current.toggle());

    expect(handle.stopPictureInPicture).toHaveBeenCalledOnce();
  });

  it('passes on whether the film was playing as the window closed', () => {
    const onStop = vi.fn();
    const { result } = renderHook(() => useTvPip(vi.fn(), onStop));
    act(() => result.current.binding.onStart());

    act(() => result.current.binding.onStop(true));

    expect(result.current.active).toBe(false);
    expect(onStop).toHaveBeenCalledWith(true);
  });

  it('does nothing without a view to ask', () => {
    const { result } = renderHook(() => useTvPip(vi.fn(), vi.fn()));

    act(() => result.current.toggle());

    expect(result.current.active).toBe(false);
  });

  it('swallows a request the system refuses', async () => {
    const handle = view();
    handle.startPictureInPicture.mockRejectedValueOnce(new Error('unsupported'));
    const { result } = renderHook(() => useTvPip(vi.fn(), vi.fn()));
    act(() => result.current.binding.attach(handle));

    act(() => result.current.toggle());
    await Promise.resolve();

    expect(result.current.active).toBe(false);
  });
});
