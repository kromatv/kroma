// @vitest-environment jsdom
//
// The Apple TV / Android TV remote, routed into the player.
//
// The player is the one screen that does NOT use the OS focus engine - its
// chrome is virtually focused, because the transport has to stay reachable while
// the chrome fades, the progress bar scrubs by HELD direction, and a panel
// slides in over the top. So directional presses cannot arrive as focus moves
// the way they do everywhere else; they are read off the remote here.
//
// Two things this file has already been the wrong shape for:
//
//   - The web half calls `window.addEventListener`. React Native defines
//     `window` as `global`, so that call is not missing, it is UNDEFINED - the
//     player took the whole app down with "undefined is not a function" the
//     moment it mounted.
//   - Unclaimed, tvOS treats Menu as "leave the app". Back in the player did not
//     close the settings panel or return to the detail screen; it quit KROMA
//     outright, mid-film. The claim goes through the shared counter, because the
//     screen underneath holds one too and whichever unmounts first would
//     otherwise drop it for both.
//
// Routing itself belongs to lib/player-keys and is covered there; what is pinned
// here is the vocabulary, the key-up filter and the claim.

import type { RemoteKey } from '@kroma/core';
import { act, renderHook } from '@testing-library/react';
import type { HWEvent } from 'react-native';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const rn = vi.hoisted(() => ({
  os: 'ios' as 'ios' | 'android',
  remote: null as ((event: HWEvent) => void) | null,
  enableTVMenuKey: vi.fn(),
  disableTVMenuKey: vi.fn(),
}));

vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return rn.os;
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

const routeRemoteKey = vi.hoisted(() => vi.fn());
vi.mock('../lib/player-keys', () => ({ routeRemoteKey }));

import { usePlayerKeys } from './usePlayerKeys';

/** The params object is opaque here - it belongs to the router - so a plain tag
 *  is enough to tell one screen's params from another's. */
const params = (tag: string) => ({ tag }) as never;

function press(eventType: string, eventKeyAction = 0) {
  act(() => {
    rn.remote?.({ eventType, eventKeyAction } as HWEvent);
  });
}

/** The logical keys the router was handed, in order. */
const routed = (): RemoteKey[] => routeRemoteKey.mock.calls.map(([, key]) => key as RemoteKey);

beforeEach(() => {
  rn.os = 'ios';
  rn.remote = null;
  vi.clearAllMocks();
});

afterEach(() => {
  // The Menu claim is counted at module scope; a player left mounted leaks it.
  vi.restoreAllMocks();
});

describe('the remote’s vocabulary', () => {
  it('speaks both halves of the Siri remote as the same directions', () => {
    const { unmount } = renderHook(() => usePlayerKeys(params('a')));
    // The clickpad and the touch surface are different gesture recognisers and
    // never both fire for one gesture, so both spellings have to be mapped.
    for (const event of ['up', 'down', 'left', 'right']) press(event);
    for (const event of ['swipeUp', 'swipeDown', 'swipeLeft', 'swipeRight']) press(event);
    expect(routed()).toEqual(['Up', 'Down', 'Left', 'Right', 'Up', 'Down', 'Left', 'Right']);
    unmount();
  });

  it('takes Menu and Back as the same intent', () => {
    const { unmount } = renderHook(() => usePlayerKeys(params('a')));
    // tvOS reports `menu` once the key is claimed; Android TV sends `back`.
    press('menu');
    press('back');
    expect(routed()).toEqual(['Back', 'Back']);
    unmount();
  });

  it('maps the whole transport', () => {
    const { unmount } = renderHook(() => usePlayerKeys(params('a')));
    const transport: Array<[string, RemoteKey]> = [
      ['select', 'Enter'],
      ['playPause', 'PlayPause'],
      ['play', 'Play'],
      ['pause', 'Pause'],
      ['fastForward', 'FastForward'],
      ['rewind', 'Rewind'],
      ['stop', 'Stop'],
      ['nextTrack', 'Next'],
      ['previousTrack', 'Prev'],
    ];
    for (const [event] of transport) press(event);
    expect(routed()).toEqual(transport.map(([, key]) => key));
    unmount();
  });

  it('ignores everything the map does not name', () => {
    const { unmount } = renderHook(() => usePlayerKeys(params('a')));
    // focus/blur/pan and the long-press variants all land here; an explicit map
    // rather than a fallthrough is what keeps them out.
    for (const event of ['focus', 'blur', 'pan', 'longSelect', 'longUp']) press(event);
    expect(routeRemoteKey).not.toHaveBeenCalled();
    unmount();
  });
});

describe('the key-up filter', () => {
  it('acts on a tvOS event even though it is stamped as a key up', () => {
    rn.os = 'ios';
    const { unmount } = renderHook(() => usePlayerKeys(params('a')));
    // tvOS reports ONE event per press and stamps it `1` anyway; filtering on
    // that stamp leaves the player's transport dead on Apple TV.
    press('playPause', 1);
    expect(routed()).toEqual(['PlayPause']);
    unmount();
  });

  it('drops the trailing half of an Android TV press', () => {
    rn.os = 'android';
    const { unmount } = renderHook(() => usePlayerKeys(params('a')));
    press('playPause', 0);
    press('playPause', 1);
    // Acting on both toggles play twice, so the film never actually pauses.
    expect(routed()).toEqual(['PlayPause']);
    unmount();
  });
});

describe('the Menu claim', () => {
  it('holds the key for as long as the player is on screen', () => {
    const { unmount } = renderHook(() => usePlayerKeys(params('a')));
    expect(rn.enableTVMenuKey).toHaveBeenCalledOnce();
    expect(rn.disableTVMenuKey).not.toHaveBeenCalled();
    unmount();
    expect(rn.disableTVMenuKey).toHaveBeenCalledOnce();
  });

  it('shares the counter with the screen underneath', () => {
    const screen = renderHook(() => usePlayerKeys(params('screen')));
    const player = renderHook(() => usePlayerKeys(params('player')));
    // One switch, two claimants.
    expect(rn.enableTVMenuKey).toHaveBeenCalledOnce();

    player.unmount();
    // Whichever unmounts first must not drop the claim for both - that is the
    // press that quit the app mid-film.
    expect(rn.disableTVMenuKey).not.toHaveBeenCalled();

    screen.unmount();
    expect(rn.disableTVMenuKey).toHaveBeenCalledOnce();
  });

  it('claims once, however often the player re-renders', () => {
    const { rerender, unmount } = renderHook(({ tag }) => usePlayerKeys(params(tag)), {
      initialProps: { tag: 'a' },
    });
    rerender({ tag: 'b' });
    rerender({ tag: 'c' });
    expect(rn.enableTVMenuKey).toHaveBeenCalledOnce();
    unmount();
  });
});

describe('the params the router is handed', () => {
  it('are always the latest, without re-subscribing', () => {
    const { rerender, unmount } = renderHook(({ tag }) => usePlayerKeys(params(tag)), {
      initialProps: { tag: 'first' },
    });
    rerender({ tag: 'second' });
    press('select');
    // A player re-renders constantly (the progress bar alone), so the handler
    // reads a ref rather than being rebuilt and re-attached each time.
    expect(routeRemoteKey).toHaveBeenCalledWith({ tag: 'second' }, 'Enter');
    unmount();
  });
});

describe('on mainline React Native, where the remote surface does not exist', () => {
  it('mounts and unmounts without it', async () => {
    vi.resetModules();
    vi.doMock('react-native', () => ({
      Platform: { OS: 'android' },
      TVEventControl: undefined,
      useTVEventHandler: undefined,
    }));

    const { usePlayerKeys: usePhoneKeys } = await import('./usePlayerKeys');
    // The phone player renders the same component tree; the hook count must not
    // change between builds, and the missing menu switch must not throw.
    const { unmount } = renderHook(() => usePhoneKeys(params('phone')));
    expect(() => unmount()).not.toThrow();

    vi.doUnmock('react-native');
    vi.resetModules();
  });
});
