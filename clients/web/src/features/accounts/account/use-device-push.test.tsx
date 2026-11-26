// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, type Mock, vi } from 'vitest';
import { useDevicePush } from './use-device-push.hook';

interface Mocks {
  blocker: string | null;
  key: Mock;
  enablePush: Mock;
  disablePush: Mock;
  client: object;
  push: object;
}

const mocks: Mocks = vi.hoisted(() => ({
  blocker: null,
  key: vi.fn(),
  enablePush: vi.fn(),
  disablePush: vi.fn(),
  client: { name: 'client' },
  push: { name: 'web push' },
}));
vi.mock('@kromatv/client/notifications', () => ({
  enablePush: mocks.enablePush,
  disablePush: mocks.disablePush,
}));
vi.mock('#web/shared/lib/push', () => ({
  pushBlocker: () => mocks.blocker,
  webPush: mocks.push,
}));
vi.mock('#web/shared/lib/web-runtime', () => ({
  useWebRuntime: () => ({
    client: mocks.client,
    queries: { userQueries: { pushKey: () => ({ queryKey: ['push-key'], queryFn: mocks.key }) } },
  }),
}));

function mount(options?: { enabled?: boolean }) {
  const queries = new QueryClient();
  const wrapper = ({ children }: Readonly<{ children: ReactNode }>) => (
    <QueryClientProvider client={queries}>{children}</QueryClientProvider>
  );
  return renderHook(() => useDevicePush(options), { wrapper }).result;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.blocker = null;
});

describe('useDevicePush', () => {
  it('reads whether this device receives pushes', async () => {
    mocks.key.mockResolvedValue({ subscribed: true });

    const result = mount();

    await waitFor(() => expect(result.current.subscribed).toBe(true));
  });

  it('reads a device the server has not answered for as not receiving them', () => {
    expect(mount({ enabled: false }).current.subscribed).toBe(false);
    expect(mocks.key).not.toHaveBeenCalled();
  });

  it('says what stops a browser that cannot receive them', () => {
    mocks.blocker = 'insecure';

    expect(mount({ enabled: false }).current.blocker).toBe('insecure');
  });

  it('turns pushes on, then asks the server again', async () => {
    mocks.key.mockResolvedValue({ subscribed: false });
    const result = mount();
    await waitFor(() => expect(mocks.key).toHaveBeenCalledTimes(1));

    await act(() => result.current.setSubscribed(true));

    expect(mocks.enablePush).toHaveBeenCalledWith(mocks.push, mocks.client);
    expect(mocks.key).toHaveBeenCalledTimes(2);
  });

  it('turns pushes off', async () => {
    mocks.key.mockResolvedValue({ subscribed: true });
    const result = mount();

    await act(() => result.current.setSubscribed(false));

    expect(mocks.disablePush).toHaveBeenCalledWith(mocks.push, mocks.client);
    expect(mocks.enablePush).not.toHaveBeenCalled();
  });
});
