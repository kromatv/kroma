// @vitest-environment jsdom
// Mounting native push at the app root: keeping the grant alive, and routing a
// tap exactly once. The hooks run unconditionally on every launch, so what
// matters is what they do NOT do — re-register a grant the server never took,
// or replay the launch tap when the reader switches profile.

import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => ({
  status: 'signedIn' as string,
  client: {
    subscribePush: vi.fn(async () => undefined),
    unsubscribePush: vi.fn(async () => undefined),
  } as Record<string, ReturnType<typeof vi.fn>>,
}));
vi.mock('#mobile/lib/session', () => ({ useSession: () => session }));
vi.mock('#mobile/lib/i18n', () => ({ useT: () => (key: string) => key }));
vi.mock('#mobile/lib/device', () => ({ deviceLabel: () => 'iPhone 17 Pro' }));

const push = vi.hoisted(() => vi.fn());
vi.mock('expo-router', () => ({ useRouter: () => ({ push }) }));

const notifications = vi.hoisted(() => ({
  setNotificationHandler: vi.fn(),
  getLastNotificationResponse: vi.fn(() => null as unknown),
  addNotificationResponseReceivedListener: vi.fn(() => ({ remove: vi.fn() })),
}));
vi.mock('./native', () => ({ push: () => notifications }));

vi.mock('./push', () => ({
  setPushTranslator: vi.fn(),
  registerCategories: vi.fn(async () => undefined),
  registerAndroidChannels: vi.fn(async () => undefined),
}));

const refreshGrant = vi.hoisted(() => vi.fn());
vi.mock('./relay', () => ({ refreshGrant }));

const handleTap = vi.hoisted(() => vi.fn(async () => '/show/abc' as string | null));
vi.mock('./taps', () => ({ handleTap }));

const { usePushGrantRefresh, usePushTaps } = await import('./usePush');

const settle = () => new Promise((r) => setTimeout(r, 0));

// A fresh module instance, i.e. a fresh launch: the cold-start latch lives for
// the life of the JS context, so tests about it must not share one.
async function freshLaunch(): Promise<typeof usePushTaps> {
  vi.resetModules();
  return (await import('./usePush')).usePushTaps;
}

beforeEach(() => {
  session.status = 'signedIn';
  push.mockClear();
  handleTap.mockClear().mockResolvedValue('/show/abc');
  refreshGrant.mockReset().mockResolvedValue(null);
  session.client.subscribePush.mockClear().mockResolvedValue(undefined);
  session.client.unsubscribePush.mockClear().mockResolvedValue(undefined);
  notifications.getLastNotificationResponse.mockClear().mockReturnValue(null);
  notifications.addNotificationResponseReceivedListener.mockClear();
});

describe('keeping the grant alive', () => {
  it('does nothing while the stored grant has time left', async () => {
    renderHook(() => usePushGrantRefresh());
    await settle();
    expect(session.client.subscribePush).not.toHaveBeenCalled();
  });

  it('registers the replacement, then adopts it, then retires the old row', async () => {
    // Adopting before the server accepts would leave the phone holding a grant
    // the server never saw; leaving the old row alive delivers every
    // notification twice, since it has weeks left before it expires.
    const commit = vi.fn(async () => undefined);
    refreshGrant.mockResolvedValue({ grant: 'v1.new', previous: 'v1.old', commit });

    renderHook(() => usePushGrantRefresh());
    await settle();

    expect(session.client.subscribePush).toHaveBeenCalledWith({
      transport: 'relay',
      endpoint: 'v1.new',
      device: 'iPhone 17 Pro',
    });
    expect(commit).toHaveBeenCalled();
    expect(session.client.unsubscribePush).toHaveBeenCalledWith('v1.old');
  });

  it('does not adopt a grant the server refused', async () => {
    const commit = vi.fn(async () => undefined);
    refreshGrant.mockResolvedValue({ grant: 'v1.new', previous: 'v1.old', commit });
    session.client.subscribePush.mockRejectedValue(new Error('offline'));

    renderHook(() => usePushGrantRefresh());
    await settle();

    // Still the old grant on file, which is the only one the server can be told
    // to forget.
    expect(commit).not.toHaveBeenCalled();
    expect(session.client.unsubscribePush).not.toHaveBeenCalled();
  });

  it('keeps the new grant even when retiring the old row fails', async () => {
    // A duplicate is better than a lost registration.
    const commit = vi.fn(async () => undefined);
    refreshGrant.mockResolvedValue({ grant: 'v1.new', previous: 'v1.old', commit });
    session.client.unsubscribePush.mockRejectedValue(new Error('offline'));

    renderHook(() => usePushGrantRefresh());
    await settle();

    expect(commit).toHaveBeenCalled();
  });

  it('stays out of it while signed out', async () => {
    session.status = 'signedOut';
    renderHook(() => usePushGrantRefresh());
    await settle();
    expect(refreshGrant).not.toHaveBeenCalled();
  });
});

describe('routing a tap', () => {
  it('acts on the tap that cold-started the app', async () => {
    notifications.getLastNotificationResponse.mockReturnValue({ id: 'cold' });
    const taps = await freshLaunch();

    renderHook(() => taps());
    await settle();

    expect(handleTap).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith('/show/abc');
  });

  it('does NOT act on it again when the hook re-runs', async () => {
    // `getLastNotificationResponse` is sticky for the life of the JS context,
    // and this effect re-runs on a profile switch; replaying would re-POST the
    // tap's action under the new account, or navigate unprompted.
    notifications.getLastNotificationResponse.mockReturnValue({ id: 'cold' });
    const taps = await freshLaunch();

    const first = renderHook(() => taps());
    await settle();
    expect(handleTap).toHaveBeenCalledTimes(1);
    first.unmount();

    // Same launch, new client identity - which is what switching profile does.
    session.client = { ...session.client };
    renderHook(() => taps());
    await settle();

    expect(handleTap).toHaveBeenCalledTimes(1);
  });

  it('listens for taps while the app is running', async () => {
    const taps = await freshLaunch();
    renderHook(() => taps());
    await settle();
    expect(notifications.addNotificationResponseReceivedListener).toHaveBeenCalled();
  });

  it('does not navigate when the tap has no screen on this app', async () => {
    notifications.getLastNotificationResponse.mockReturnValue({ id: 'cold' });
    handleTap.mockResolvedValue(null);
    const taps = await freshLaunch();

    renderHook(() => taps());
    await settle();

    expect(push).not.toHaveBeenCalled();
  });
});
