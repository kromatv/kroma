// @vitest-environment jsdom
//
// tvOS and the legacy Android root deliver remote keys through `useTVEventHandler`;
// under the new architecture the Android root is ReactSurfaceView, which routes
// them to per-view `onKeyDown` instead. Both streams are covered here.

import { act, renderHook } from '@testing-library/react';
import type { HWEvent, NativeSyntheticEvent, TVKeyEvent } from 'react-native';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rn = vi.hoisted(() => ({
  os: 'ios' as 'ios' | 'android',
  hasTvEvents: true,
  remote: null as ((event: HWEvent) => void) | null,
}));

vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return rn.os;
    },
  },
  get useTVEventHandler() {
    return rn.hasTvEvents
      ? (handler: (event: HWEvent) => void) => {
          rn.remote = handler;
        }
      : undefined;
  },
}));

interface RemoteControl {
  remoteControlSubscriber: (handle: (direction: string) => void) => () => void;
  remoteControlUnsubscriber: (stop: () => void) => void;
}

const nav = vi.hoisted(() => ({ control: null as RemoteControl | null }));

vi.mock('react-tv-space-navigation', () => ({
  SpatialNavigation: {
    configureRemoteControl: (control: RemoteControl) => {
      nav.control = control;
    },
  },
}));

type Remote = typeof import('./focus-remote');
type InputGate = typeof import('./input-gate');

// Fresh module per platform: `IS_ANDROID`, the TV-hook presence and the
// subscription sets all live at module scope.
async function load(
  os: 'ios' | 'android' = 'ios',
  hasTvEvents = true,
): Promise<{ remote: Remote; gate: InputGate }> {
  rn.os = os;
  rn.hasTvEvents = hasTvEvents;
  rn.remote = null;
  nav.control = null;
  vi.resetModules();

  const remote: Remote = await import('./focus-remote');
  const gate: InputGate = await import('./input-gate');
  remote.configureRemote();
  return { remote, gate };
}

function navigator(): { moves: string[]; stop: () => void } {
  const moves: string[] = [];
  if (!nav.control) throw new Error('configureRemote never ran');
  const stop = nav.control.remoteControlSubscriber((direction) => moves.push(direction));
  return { moves, stop };
}

function press(eventType: string, eventKeyAction = 0) {
  act(() => {
    rn.remote?.({ eventType, eventKeyAction } as HWEvent);
  });
}

function keyDown(
  props: { onKeyDown?: (e: NativeSyntheticEvent<TVKeyEvent>) => void },
  over: Partial<TVKeyEvent>,
) {
  act(() => {
    props.onKeyDown?.({
      nativeEvent: { code: '', key: '', altKey: false, ctrlKey: false, metaKey: false, ...over },
    } as NativeSyntheticEvent<TVKeyEvent>);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('the navigator subscription', () => {
  it('holds every subscriber at once, so a stacking screen cannot go dead', async () => {
    const { remote } = await load();
    const first = navigator();
    const second = navigator();
    // React mounts the new screen's subscription BEFORE tearing the old one down.
    first.stop();

    renderHook(() => remote.useRemoteBridge());
    press('up');
    expect(second.moves).toEqual(['up']);
  });

  it('stops posting to a subscriber that has gone', async () => {
    const { remote } = await load();
    const only = navigator();
    only.stop();
    renderHook(() => remote.useRemoteBridge());
    press('up');
    expect(only.moves).toEqual([]);
  });

  it('unsubscribes by calling the stopper it was given', async () => {
    await load();
    const stop = vi.fn();
    nav.control?.remoteControlUnsubscriber(stop);
    expect(stop).toHaveBeenCalledOnce();
  });
});

describe('the TV remote', () => {
  it('speaks both halves of the Siri remote', async () => {
    const { remote } = await load();
    const nav1 = navigator();
    renderHook(() => remote.useRemoteBridge());

    // The clickpad and the touch surface are different gesture recognisers and
    // never both fire for one gesture.
    for (const event of ['up', 'down', 'left', 'right']) press(event);
    for (const event of ['swipeUp', 'swipeDown', 'swipeLeft', 'swipeRight']) press(event);

    expect(nav1.moves).toEqual(['up', 'down', 'left', 'right', 'up', 'down', 'left', 'right']);
  });

  it('turns Select into the navigator’s enter', async () => {
    const { remote } = await load();
    const nav1 = navigator();
    renderHook(() => remote.useRemoteBridge());
    press('select');
    expect(nav1.moves).toEqual(['enter']);
  });

  it('ignores a button the navigator has no direction for', async () => {
    const { remote } = await load();
    const nav1 = navigator();
    renderHook(() => remote.useRemoteBridge());
    for (const event of ['menu', 'playPause', 'longSelect']) press(event);
    expect(nav1.moves).toEqual([]);
  });

  it('acts on a tvOS event stamped as a key up', async () => {
    const { remote } = await load('ios');
    const nav1 = navigator();
    renderHook(() => remote.useRemoteBridge());
    // tvOS reports ONE event per press and stamps it `1` regardless.
    press('up', 1);
    expect(nav1.moves).toEqual(['up']);
  });

  it('drops the trailing half of an Android press', async () => {
    const { remote } = await load('android');
    const nav1 = navigator();
    renderHook(() => remote.useRemoteBridge());
    press('up', 0);
    press('up', 1);
    expect(nav1.moves).toEqual(['up']);
  });

  it('goes inert while something full-screen owns the remote', async () => {
    const { remote, gate } = await load();
    const nav1 = navigator();
    renderHook(() => remote.useRemoteBridge());
    const release = gate.holdInput();

    press('up');
    expect(nav1.moves).toEqual([]);

    release();
    press('up');
    expect(nav1.moves).toEqual(['up']);
  });

  it('mounts without a remote at all on mainline React Native', async () => {
    const { remote } = await load('android', false);
    expect(() => renderHook(() => remote.useRemoteBridge())).not.toThrow();
  });
});

describe('the Android key host', () => {
  it('gives the focus root nothing to spread off Android', async () => {
    const { remote } = await load('ios');
    const { result } = renderHook(() => remote.useRemoteHostProps());
    expect(result.current).toEqual({});
  });

  it('routes the arrow keys the renderer actually sends', async () => {
    const { remote } = await load('android');
    const nav1 = navigator();
    const { result } = renderHook(() => remote.useRemoteHostProps());

    for (const code of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter']) {
      keyDown(result.current, { code });
    }
    expect(nav1.moves).toEqual(['up', 'down', 'left', 'right', 'enter']);
  });

  it('passes auto-repeat straight through, which is how a long rail scrolls', async () => {
    const { remote } = await load('android');
    const nav1 = navigator();
    const { result } = renderHook(() => remote.useRemoteHostProps());
    for (let i = 0; i < 4; i++) keyDown(result.current, { code: 'ArrowRight' });
    expect(nav1.moves).toHaveLength(4);
  });

  it('is inert while something full-screen owns the remote', async () => {
    const { remote, gate } = await load('android');
    const nav1 = navigator();
    const { result } = renderHook(() => remote.useRemoteHostProps());
    gate.holdInput();
    keyDown(result.current, { code: 'ArrowUp' });
    expect(nav1.moves).toEqual([]);
  });
});

describe('typing on a hardware keyboard', () => {
  it('delivers letters to whoever is collecting text', async () => {
    const { remote } = await load('android');
    const typed: string[] = [];
    renderHook(() => remote.useHardwareKeys((key) => typed.push(key)));
    const { result } = renderHook(() => remote.useRemoteHostProps());

    for (const key of ['k', 'r', 'o']) keyDown(result.current, { code: `Key${key}`, key });
    expect(typed).toEqual(['k', 'r', 'o']);
  });

  it('delivers Backspace, which is an edit rather than a character', async () => {
    const { remote } = await load('android');
    const typed: string[] = [];
    renderHook(() => remote.useHardwareKeys((key) => typed.push(key)));
    const { result } = renderHook(() => remote.useRemoteHostProps());
    keyDown(result.current, { code: 'Backspace', key: 'Backspace' });
    expect(typed).toEqual(['Backspace']);
  });

  it('never sees a direction, because a direction is spent on the navigator', async () => {
    const { remote } = await load('android');
    const typed: string[] = [];
    renderHook(() => remote.useHardwareKeys((key) => typed.push(key)));
    const { result } = renderHook(() => remote.useRemoteHostProps());
    // Enter counts as a direction: it activates the focused key rather than
    // typing a newline into the search box.
    for (const code of ['ArrowUp', 'Enter']) keyDown(result.current, { code, key: code });
    expect(typed).toEqual([]);
  });

  it('ignores a modified key and a bare modifier', async () => {
    const { remote } = await load('android');
    const typed: string[] = [];
    renderHook(() => remote.useHardwareKeys((key) => typed.push(key)));
    const { result } = renderHook(() => remote.useRemoteHostProps());

    keyDown(result.current, { code: 'KeyA', key: 'a', metaKey: true });
    keyDown(result.current, { code: 'KeyA', key: 'a', ctrlKey: true });
    keyDown(result.current, { code: 'KeyA', key: 'a', altKey: true });
    // A named key is longer than one character, which is what tells it apart.
    keyDown(result.current, { code: 'ShiftLeft', key: 'Shift' });
    expect(typed).toEqual([]);
  });

  it('always calls the LATEST handler, without re-subscribing', async () => {
    const { remote } = await load('android');
    const first: string[] = [];
    const second: string[] = [];
    const { rerender } = renderHook(({ sink }) => remote.useHardwareKeys((k) => sink.push(k)), {
      initialProps: { sink: first },
    });
    const { result } = renderHook(() => remote.useRemoteHostProps());

    rerender({ sink: second });
    keyDown(result.current, { code: 'KeyZ', key: 'z' });
    expect(first).toEqual([]);
    expect(second).toEqual(['z']);
  });

  it('stops collecting once the keyboard is gone', async () => {
    const { remote } = await load('android');
    const typed: string[] = [];
    const { unmount } = renderHook(() => remote.useHardwareKeys((key) => typed.push(key)));
    const { result } = renderHook(() => remote.useRemoteHostProps());

    unmount();
    keyDown(result.current, { code: 'KeyZ', key: 'z' });
    expect(typed).toEqual([]);
  });

  it('holds every collector at once, like the navigator subscriptions', async () => {
    const { remote } = await load('android');
    const a: string[] = [];
    const b: string[] = [];
    const first = renderHook(() => remote.useHardwareKeys((key) => a.push(key)));
    renderHook(() => remote.useHardwareKeys((key) => b.push(key)));
    const { result } = renderHook(() => remote.useRemoteHostProps());

    first.unmount();
    keyDown(result.current, { code: 'KeyZ', key: 'z' });
    expect(a).toEqual([]);
    expect(b).toEqual(['z']);
  });
});
