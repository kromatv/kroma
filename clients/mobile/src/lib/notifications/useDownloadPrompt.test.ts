// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const platform = vi.hoisted(() => ({ OS: 'android' as string }));
vi.mock('react-native', () => ({ Platform: platform }));

const notifications = vi.hoisted(() => ({
  getPermissionsAsync: vi.fn(),
  requestPermissionsAsync: vi.fn(),
}));
const loadPush = vi.hoisted(() => vi.fn(() => notifications as unknown));
vi.mock('./native', () => ({ push: loadPush }));

const { useDownloadPrompt } = await import('./useDownloadPrompt');

const settled = () => new Promise((resolve) => setTimeout(resolve));

function undecided(canAskAgain = true) {
  return { status: 'undetermined', canAskAgain };
}

beforeEach(() => {
  vi.clearAllMocks();
  platform.OS = 'android';
  loadPush.mockReturnValue(notifications as unknown);
  notifications.getPermissionsAsync.mockResolvedValue(undecided());
  notifications.requestPermissionsAsync.mockResolvedValue({ status: 'granted' });
});

describe('asking for notifications when a download starts', () => {
  it('waits for the answer before running the download', async () => {
    const { result } = renderHook(() => useDownloadPrompt());
    const run = vi.fn();
    let answer = (_: unknown) => {};

    notifications.requestPermissionsAsync.mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );

    result.current(run);
    await settled();
    const whileAsking = run.mock.calls.length;
    answer({ status: 'granted' });
    await settled();

    expect(whileAsking).toBe(0);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('runs the download after a refusal', async () => {
    const { result } = renderHook(() => useDownloadPrompt());
    const run = vi.fn();

    notifications.requestPermissionsAsync.mockResolvedValue({ status: 'denied' });

    result.current(run);
    await settled();

    expect(run).toHaveBeenCalledTimes(1);
  });

  it('asks once, however many titles a refusal is followed by', async () => {
    const { result } = renderHook(() => useDownloadPrompt());
    const run = vi.fn();

    notifications.requestPermissionsAsync.mockResolvedValue({ status: 'denied' });
    notifications.getPermissionsAsync.mockResolvedValue({ status: 'denied', canAskAgain: true });

    result.current(run);
    await settled();
    result.current(run);
    result.current(run);
    await settled();

    expect(notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledTimes(3);
  });

  it('does not ask a phone that already granted', async () => {
    const { result } = renderHook(() => useDownloadPrompt());
    const run = vi.fn();

    notifications.getPermissionsAsync.mockResolvedValue({ status: 'granted', canAskAgain: true });

    result.current(run);
    await settled();

    expect(notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('does not ask once the system would no longer show the prompt', async () => {
    const { result } = renderHook(() => useDownloadPrompt());
    const run = vi.fn();

    notifications.getPermissionsAsync.mockResolvedValue({ status: 'denied', canAskAgain: false });

    result.current(run);
    await settled();

    expect(notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('runs the download when the permission check itself fails', async () => {
    const { result } = renderHook(() => useDownloadPrompt());
    const run = vi.fn();

    notifications.getPermissionsAsync.mockRejectedValue(new Error('no activity'));

    result.current(run);
    await settled();

    expect(run).toHaveBeenCalledTimes(1);
  });

  it('runs the download on a build with no native module', async () => {
    const { result } = renderHook(() => useDownloadPrompt());
    const run = vi.fn();

    loadPush.mockReturnValue(null);

    result.current(run);
    await settled();

    expect(run).toHaveBeenCalledTimes(1);
  });

  it('leaves iOS alone and runs the download straight away', () => {
    const { result } = renderHook(() => useDownloadPrompt());
    const run = vi.fn();

    platform.OS = 'ios';

    result.current(run);

    expect(notifications.getPermissionsAsync).not.toHaveBeenCalled();
    expect(run).toHaveBeenCalledTimes(1);
  });
});
