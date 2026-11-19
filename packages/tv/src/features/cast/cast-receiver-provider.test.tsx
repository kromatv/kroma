// @vitest-environment jsdom

import { fakeClient } from '@kromatv/client/test';
import { onScreen } from '@kromatv/ui/testing';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDevicePreferences, DevicePreferencesProvider } from '#tv/app/device-preferences';
import { CastReceiverProvider } from '#tv/features/cast/cast-receiver-provider.component';
import { createDeviceIdentity, type DeviceIdentity } from '#tv/shared/device';

interface SocketHooks {
  onOpen?: () => void;
  onClose?: () => void;
  onEvent?: (event: unknown) => void;
}

const H = vi.hoisted(() => ({
  hooks: null as SocketHooks | null,
  applied: [] as unknown[],
  sockets: 0,
  closes: 0,
}));

vi.mock('@kromatv/client/events', async (importOriginal) => {
  const original = await importOriginal<typeof import('@kromatv/client/events')>();
  class FakeEvents {
    readonly open = true;
    constructor(_baseUrl: string, hooks: SocketHooks) {
      H.hooks = hooks;
      H.sockets += 1;
    }
    connect(): void {}
    close(): void {
      H.closes += 1;
    }
    send(): boolean {
      return true;
    }
  }
  return { ...original, KromaEvents: FakeEvents };
});

vi.mock('#tv/features/cast/apply-command', () => ({
  applyCastCommand: (command: unknown) => {
    H.applied.push(command);
  },
}));

vi.mock('#tv/app/providers/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#tv/app/providers/auth')>()),
  useAuth: () => ({ user: { id: 'u1' }, ready: true }),
}));

vi.mock('#tv/app/router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#tv/app/router')>()),
  useNav: () => ({}),
}));

const forgetWake = vi.fn(async () => undefined);
const client = fakeClient({
  cast: { announce: async () => ({ commands: [], ttlSecs: 45 }), forgetWake },
});

const PLAY = { type: 'play', itemId: 'it1', positionMs: 0 } as const;

function mount(
  identity: DeviceIdentity = createDeviceIdentity(),
  preferences = createDevicePreferences(null),
) {
  return render(
    onScreen(
      <DevicePreferencesProvider value={preferences}>
        <CastReceiverProvider client={client} name="Salon" identity={identity}>
          <div>picker</div>
        </CastReceiverProvider>
      </DevicePreferencesProvider>,
    ),
  );
}

function appVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

afterEach(() => {
  appVisibility('visible');
  cleanup();
  H.hooks = null;
  H.applied.length = 0;
  H.sockets = 0;
  H.closes = 0;
  forgetWake.mockClear();
});

describe('CastReceiverProvider', () => {
  it('renders the app before a server is reached', () => {
    render(
      <CastReceiverProvider client={null} name="Salon">
        <div>picker</div>
      </CastReceiverProvider>,
    );
    expect(screen.getByText('picker')).toBeTruthy();
  });

  it('obeys a command numbered 1 again once the socket has come back', async () => {
    const deviceId = createDeviceIdentity();
    mount(deviceId);
    const hooks = H.hooks;
    if (!hooks) {
      throw new Error('expected the receiver to have opened a socket');
    }
    const command = { type: 'cast.command', receiverId: deviceId(), seq: 1, command: PLAY };

    await act(async () => {
      hooks.onEvent?.(command);
    });
    await act(async () => {
      hooks.onClose?.();
    });
    await act(async () => {
      hooks.onEvent?.(command);
    });

    expect(H.applied).toEqual([PLAY, PLAY]);
  });

  it('keeps what the server holds while control from another device is allowed', () => {
    mount();

    expect(forgetWake).not.toHaveBeenCalled();
  });

  it('has the server forget the set when control from another device is switched off', () => {
    const deviceId = createDeviceIdentity();
    const preferences = createDevicePreferences(null);
    preferences.castReceiver.set('off');

    mount(deviceId, preferences);

    expect(forgetWake).toHaveBeenCalledExactlyOnceWith(deviceId());
  });

  it('closes the receiver while the television is showing something else', () => {
    mount();

    appVisibility('hidden');

    expect(H.closes).toBe(1);
  });

  it('attaches again when the television comes back to the app', () => {
    mount();
    appVisibility('hidden');

    appVisibility('visible');

    expect(H.sockets).toBe(2);
  });
});
