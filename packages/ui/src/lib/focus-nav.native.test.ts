// @vitest-environment jsdom
//
// The native focus engine (Apple TV, Android TV, phones).
//
// The OS focus engine owns directional movement, so this module only bridges the
// two keys it does NOT route to a focusable: Back and PlayPause.
//
//   - The Menu key is ONE global switch with two nesting claimants (every screen
//     through this hook, and the player through usePlayerKeys). Toggling it per
//     claimant lets the inner one hand the key back while the outer one still
//     needs it.
//   - `eventKeyAction === 1` is "key up" on Android TV and "every event" on
//     tvOS; filtering on it naively drops every Menu and transport key on Apple
//     TV while the app still LOOKS alive.
//   - The whole TV remote surface only exists in the react-native-tvos fork, and
//     the phone app runs on mainline. The same screens have to compile and run
//     on both.
//
// The web half has its own engine and its own test: focus-nav.test.ts.

import { act, cleanup, renderHook } from '@testing-library/react';
import type { HWEvent } from 'react-native';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const rn = vi.hoisted(() => ({
  remote: null as ((event: HWEvent) => void) | null,
  back: [] as Array<() => boolean>,
  enableTVMenuKey: vi.fn(),
  disableTVMenuKey: vi.fn(),
  os: 'ios' as 'ios' | 'android',
  isTV: true,
}));

vi.mock('react-native', () => ({
  BackHandler: {
    addEventListener: (_event: string, handler: () => boolean) => {
      rn.back.push(handler);
      return {
        remove: () => {
          rn.back = rn.back.filter((h) => h !== handler);
        },
      };
    },
  },
  Platform: {
    get OS() {
      return rn.os;
    },
    get isTV() {
      return rn.isTV;
    },
  },
  TVEventControl: {
    enableTVMenuKey: rn.enableTVMenuKey,
    disableTVMenuKey: rn.disableTVMenuKey,
  },
  useTVEventHandler: (handler: (event: HWEvent) => void) => {
    rn.remote = handler;
  },
}));

import { focusSettled, markFocusSettled } from './focus-entry';
import { useFocusNav } from './focus-nav';
import { clearInputHolds, holdInput } from './input-gate';
import { clearPressGuard, pressGuardActive } from './press-guard';

function pressBack(): boolean {
  let consumed = false;
  act(() => {
    consumed = rn.back.map((handler) => handler()).some(Boolean);
  });
  return consumed;
}

function remote(eventType: string, eventKeyAction = 1) {
  act(() => {
    rn.remote?.({ eventType, eventKeyAction } as HWEvent);
  });
}

beforeEach(() => {
  rn.remote = null;
  rn.back = [];
  rn.os = 'ios';
  rn.isTV = true;
  clearInputHolds();
  clearPressGuard();
  vi.clearAllMocks();
});

afterEach(() => {
  // Unmount everything: the Menu-key claim is COUNTED at module scope, so a
  // screen left mounted leaks its claim into the next test.
  cleanup();
});

describe('the Menu key claim', () => {
  it('claims the key while a Back handler is mounted, and hands it back after', () => {
    const { unmount } = renderHook(() => useFocusNav({ onBack: vi.fn() }));
    // Without the claim, tvOS backs out of the app instead of reporting Menu.
    expect(rn.enableTVMenuKey).toHaveBeenCalledOnce();
    expect(rn.disableTVMenuKey).not.toHaveBeenCalled();

    unmount();
    // At the top of the stack Menu SHOULD background the app, so the last
    // claimant gives it back.
    expect(rn.disableTVMenuKey).toHaveBeenCalledOnce();
  });

  it('does not claim anything for a screen with no Back handler', () => {
    renderHook(() => useFocusNav({ onPlayPause: vi.fn() }));
    expect(rn.enableTVMenuKey).not.toHaveBeenCalled();
    expect(rn.back).toHaveLength(0);
  });

  it('COUNTS claimants, so the inner one cannot hand back the outer one’s key', () => {
    const screen = renderHook(() => useFocusNav({ onBack: vi.fn() }));
    const player = renderHook(() => useFocusNav({ onBack: vi.fn() }));
    // One switch, two claimants: the second must not re-enable it either.
    expect(rn.enableTVMenuKey).toHaveBeenCalledOnce();

    player.unmount();
    // THE BUG: releasing here is what quit the app mid-film - the settings panel
    // closed, the player still needed Menu, and the next Back left KROMA.
    expect(rn.disableTVMenuKey).not.toHaveBeenCalled();

    screen.unmount();
    expect(rn.disableTVMenuKey).toHaveBeenCalledOnce();
  });
});

describe('the hardware Back button', () => {
  // Android TV: the only platform that routes Back through BackHandler. On tvOS
  // it is layered on the `menu` remote event instead - see the describe below.
  beforeEach(() => {
    rn.os = 'android';
  });

  it('runs the screen’s handler and consumes the press', () => {
    const onBack = vi.fn();
    renderHook(() => useFocusNav({ onBack }));
    // A handler that returns nothing counts as handled.
    expect(pressBack()).toBe(true);
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('lets the press through when the screen returns false', () => {
    renderHook(() => useFocusNav({ onBack: () => false }));
    // "Not handled, keep the default" - which at the top of the stack is
    // leaving the app.
    expect(pressBack()).toBe(false);
  });

  it('swallows Back while an overlay holds the remote', () => {
    const onBack = vi.fn();
    renderHook(() => useFocusNav({ onBack }));
    holdInput();
    // Consumed but inert: letting it through would leave the app while an
    // overlay is on screen.
    expect(pressBack()).toBe(true);
    expect(onBack).not.toHaveBeenCalled();
  });

  it('stops listening once the screen is gone', () => {
    const { unmount } = renderHook(() => useFocusNav({ onBack: vi.fn() }));
    expect(rn.back).toHaveLength(1);
    unmount();
    expect(rn.back).toHaveLength(0);
  });
});

describe('Back on tvOS, where BackHandler is the Menu event wearing a hat', () => {
  it('never subscribes, so one Menu press is not routed twice', () => {
    // tvOS implements BackHandler on top of `menu`, which BACK_EVENTS already
    // maps below. Subscribing as well would run the screen's handler twice and
    // back out two screens per press.
    renderHook(() => useFocusNav({ onBack: vi.fn() }));
    expect(rn.back).toHaveLength(0);
  });

  it('still claims the Menu key, which the subscription guard must not skip', () => {
    // The guard sits on the subscription, not on the effect: hoisting it would
    // drop this claim and hand Menu back to the OS, which quits the app. Every
    // assertion above would still pass.
    const { unmount } = renderHook(() => useFocusNav({ onBack: vi.fn() }));
    expect(rn.enableTVMenuKey).toHaveBeenCalled();
    unmount();
    expect(rn.disableTVMenuKey).toHaveBeenCalled();
  });

  it('routes Menu through the remote stream exactly once', () => {
    const onBack = vi.fn();
    renderHook(() => useFocusNav({ onBack }));
    act(() => rn.remote?.({ eventType: 'menu' } as HWEvent));
    expect(onBack).toHaveBeenCalledOnce();
  });
});

describe('Back on an Android phone', () => {
  it('keeps the hardware button, which is not a television-only path', () => {
    // The guard is on the OS alone, never `Platform.isTV`: mainline React Native
    // defines no such field, so pairing the two would strip Back from the phone.
    rn.os = 'android';
    rn.isTV = false;
    const onBack = vi.fn();
    renderHook(() => useFocusNav({ onBack }));
    expect(pressBack()).toBe(true);
    expect(onBack).toHaveBeenCalledOnce();
  });
});

describe('remote events', () => {
  it('treats both Menu and Back as the same intent', () => {
    const onBack = vi.fn();
    renderHook(() => useFocusNav({ onBack }));
    // tvOS delivers `menu`; Android TV delivers `back`.
    remote('menu');
    remote('back');
    expect(onBack).toHaveBeenCalledTimes(2);
  });

  it('bridges all three spellings of the transport key', () => {
    const onPlayPause = vi.fn();
    renderHook(() => useFocusNav({ onPlayPause }));
    for (const event of ['playPause', 'play', 'pause']) remote(event);
    expect(onPlayPause).toHaveBeenCalledTimes(3);
  });

  it('ignores a direction, which belongs to the OS focus engine', () => {
    const onBack = vi.fn();
    const onPlayPause = vi.fn();
    renderHook(() => useFocusNav({ onBack, onPlayPause }));
    for (const event of ['up', 'down', 'left', 'right', 'select']) remote(event);
    expect(onBack).not.toHaveBeenCalled();
    expect(onPlayPause).not.toHaveBeenCalled();
  });

  it('is inert while an overlay holds the remote', () => {
    const onBack = vi.fn();
    renderHook(() => useFocusNav({ onBack }));
    holdInput();
    remote('menu');
    // Native has no capture phase, so an overlay cannot swallow the event - it
    // holds the input instead, and this is the half that respects the hold.
    expect(onBack).not.toHaveBeenCalled();
  });
});

describe('the key-up filter, which is not the same on the two platforms', () => {
  it('acts on a tvOS event even though it is stamped as a key up', () => {
    rn.os = 'ios';
    const onBack = vi.fn();
    renderHook(() => useFocusNav({ onBack }));
    // tvOS reports ONE event per press and stamps it `1` anyway. Filtering on
    // that stamp killed the entire remote on Apple TV.
    remote('menu', 1);
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('drops the trailing half of an Android TV press', () => {
    rn.os = 'android';
    const onBack = vi.fn();
    renderHook(() => useFocusNav({ onBack }));
    // Android reports down (0) and up (1); acting on both fires everything twice.
    remote('menu', 0);
    remote('menu', 1);
    expect(onBack).toHaveBeenCalledOnce();
  });
});

describe('what a new screen resets', () => {
  it('arms the press guard on mount', () => {
    renderHook(() => useFocusNav({}));
    // The Select that opened this screen must not also fire whatever the OS
    // auto-focuses here.
    expect(pressGuardActive()).toBe(true);
  });

  it('lets a new screen decide where focus opens again', () => {
    markFocusSettled();
    renderHook(() => useFocusNav({}));
    expect(focusSettled()).toBe(false);
  });

  it('re-runs both on a view switch, without remounting', () => {
    const { rerender } = renderHook(({ resetKey }) => useFocusNav({ resetKey }), {
      initialProps: { resetKey: 'home' },
    });
    clearPressGuard();
    markFocusSettled();

    rerender({ resetKey: 'search' });
    // A view switch is a new screen as far as focus is concerned, even though
    // the hook never unmounted.
    expect(pressGuardActive()).toBe(true);
    expect(focusSettled()).toBe(false);
  });

  it('does not re-run when the handlers merely change identity', () => {
    const { rerender } = renderHook(({ onBack }) => useFocusNav({ onBack, resetKey: 'home' }), {
      initialProps: { onBack: vi.fn() },
    });
    clearPressGuard();
    // A parent that re-renders with a fresh closure must not re-arm the guard,
    // or a screen that re-renders often would swallow deliberate presses.
    rerender({ onBack: vi.fn() });
    expect(pressGuardActive()).toBe(false);
  });
});

describe('on a phone, where the TV remote surface does not exist', () => {
  it('degrades to the hardware Back button alone', async () => {
    vi.resetModules();
    // Mainline React Native ships no `useTVEventHandler` and no `TVEventControl`.
    vi.doMock('react-native', () => ({
      BackHandler: {
        addEventListener: (_event: string, handler: () => boolean) => {
          rn.back.push(handler);
          return { remove: () => {} };
        },
      },
      Platform: { OS: 'android' },
      TVEventControl: undefined,
      useTVEventHandler: undefined,
    }));

    const { useFocusNav: usePhoneNav } = await import('./focus-nav');
    const onBack = vi.fn();
    // The same screens compile and run here: no crash from the missing hook, no
    // crash from the missing menu-key switch.
    expect(() => renderHook(() => usePhoneNav({ onBack }))).not.toThrow();
    expect(pressBack()).toBe(true);
    expect(onBack).toHaveBeenCalledOnce();

    vi.doUnmock('react-native');
    vi.resetModules();
  });
});
