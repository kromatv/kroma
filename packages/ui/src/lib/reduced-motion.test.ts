// @vitest-environment jsdom

import { renderHook, waitFor } from '@testing-library/react';
import { AccessibilityInfo } from 'react-native';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useReducedMotion } from './reduced-motion';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useReducedMotion', () => {
  it('starts on the assumption that motion is wanted, the platform answering later', () => {
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useReducedMotion());

    expect(result.current).toBe(false);
  });

  it('settles on what the platform reports', async () => {
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);

    const { result } = renderHook(() => useReducedMotion());

    await waitFor(() => expect(result.current).toBe(true));
  });

  it('follows a reader who changes their mind while the app is open', async () => {
    let announce: ((on: boolean) => void) | undefined;
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    // Overloaded on the event name, so the mock is cast rather than inferred.
    vi.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((
      _event: string,
      handler: (on: boolean) => void,
    ) => {
      announce = handler;
      return { remove: () => {} };
    }) as unknown as typeof AccessibilityInfo.addEventListener);

    const { result } = renderHook(() => useReducedMotion());
    await waitFor(() => expect(announce).toBeDefined());
    announce?.(true);

    await waitFor(() => expect(result.current).toBe(true));
  });

  it('unmounts where the platform gave it nothing to unsubscribe from', () => {
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    vi.spyOn(AccessibilityInfo, 'addEventListener').mockReturnValue(
      undefined as unknown as ReturnType<typeof AccessibilityInfo.addEventListener>,
    );

    const { unmount } = renderHook(() => useReducedMotion());

    expect(unmount).not.toThrow();
  });
});
