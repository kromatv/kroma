// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PipBinding, PipHandle } from '#tv/features/playback/player/playbackBackend';
import { browserPictureInPicture, useShellPip, useVideoPip } from './surfacePip';

type Listener = (e: { payload: unknown }) => void;

function binding() {
  const pip = {
    attach: vi.fn<(view: PipHandle | null) => void>(),
    onStart: vi.fn(),
    onStop: vi.fn(),
  };
  const handle = () => pip.attach.mock.calls[0]?.[0] ?? null;
  return { pip: pip as PipBinding, calls: pip, handle };
}

function shell({ flagged = true } = {}) {
  const listeners = new Map<string, Listener>();
  const invoke = vi.fn(async (_cmd: string, _args?: Record<string, unknown>) => undefined);
  const unlisten = vi.fn();
  let deliver: Promise<() => void> = Promise.resolve(unlisten);
  const listen = vi.fn((name: string, cb: Listener) => {
    listeners.set(name, cb);
    return deliver;
  });
  vi.stubGlobal('__TAURI__', { core: { invoke }, event: { listen } });
  if (flagged) vi.stubGlobal('__KROMA_PIP__', true);
  return {
    invoke,
    unlisten,
    emit: (name: string, payload: unknown) => listeners.get(name)?.({ payload }),
    holdListener: () => {
      let release: () => void = () => undefined;
      deliver = new Promise((resolve) => {
        release = () => resolve(unlisten);
      });
      return () => release();
    },
    refuseListener: () => {
      deliver = Promise.reject(new Error('event.listen not allowed'));
    },
  };
}

function pipDocument(enabled: boolean) {
  const exit = vi.fn(async () => undefined);
  Object.defineProperty(document, 'pictureInPictureEnabled', {
    value: enabled,
    configurable: true,
  });
  Object.defineProperty(document, 'exitPictureInPicture', { value: exit, configurable: true });
  return exit;
}

function video({ paused = true } = {}) {
  const el = document.createElement('video');
  const request = vi.fn(async () => ({}) as PictureInPictureWindow);
  Object.defineProperty(el, 'requestPictureInPicture', { value: request });
  Object.defineProperty(el, 'paused', { value: paused });
  return { el, request };
}

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(document, 'pictureInPictureEnabled');
  Reflect.deleteProperty(document, 'exitPictureInPicture');
});

describe('browserPictureInPicture', () => {
  it('offers the mpv picture once the shell has announced its PiP window', () => {
    shell();

    expect(browserPictureInPicture('mpv')).toBe(true);
  });

  it('withholds the mpv picture from a shell that announced no PiP window', () => {
    shell({ flagged: false });

    expect(browserPictureInPicture('mpv')).toBe(false);
  });

  it('withholds the mpv picture from a plain browser', () => {
    vi.stubGlobal('__KROMA_PIP__', true);

    expect(browserPictureInPicture('mpv')).toBe(false);
  });

  it('offers a video picture where the document enables picture-in-picture', () => {
    pipDocument(true);

    expect(browserPictureInPicture('video')).toBe(true);
  });

  it('withholds a video picture where the document disables picture-in-picture', () => {
    pipDocument(false);

    expect(browserPictureInPicture('video')).toBe(false);
  });

  it('never offers a plane the page does not draw', () => {
    shell();
    pipDocument(true);

    expect(browserPictureInPicture('avplay')).toBe(false);
  });
});

describe('useShellPip', () => {
  it('opens the shell window at the picture aspect', async () => {
    const s = shell();
    const b = binding();

    renderHook(() => useShellPip(b.pip, 2.39));
    await b.handle()?.startPictureInPicture();

    expect(s.invoke).toHaveBeenCalledWith('pip_start', { aspect: 2.39 });
  });

  it('opens the shell window at 16:9 while the aspect is unknown', async () => {
    const s = shell();
    const b = binding();

    renderHook(() => useShellPip(b.pip, undefined));
    await b.handle()?.startPictureInPicture();

    expect(s.invoke).toHaveBeenCalledWith('pip_start', { aspect: 16 / 9 });
  });

  it('closes the shell window', async () => {
    const s = shell();
    const b = binding();

    renderHook(() => useShellPip(b.pip, 1.78));
    await b.handle()?.stopPictureInPicture();

    expect(s.invoke).toHaveBeenCalledWith('pip_stop');
  });

  it('reports the shell window opening', () => {
    const s = shell();
    const b = binding();
    renderHook(() => useShellPip(b.pip, 1.78));

    s.emit('pip-changed', { active: true, playing: true });

    expect(b.calls.onStart).toHaveBeenCalledTimes(1);
    expect(b.calls.onStop).not.toHaveBeenCalled();
  });

  it('reports the shell window closing with whether the picture still plays', () => {
    const s = shell();
    const b = binding();
    renderHook(() => useShellPip(b.pip, 1.78));

    s.emit('pip-changed', { active: false, playing: false });

    expect(b.calls.onStop).toHaveBeenCalledWith(false);
    expect(b.calls.onStart).not.toHaveBeenCalled();
  });

  it('ignores a pip-changed payload it cannot read', () => {
    const s = shell();
    const b = binding();
    renderHook(() => useShellPip(b.pip, 1.78));

    s.emit('pip-changed', { active: 'yes' });

    expect(b.calls.onStart).not.toHaveBeenCalled();
    expect(b.calls.onStop).not.toHaveBeenCalled();
  });

  it('detaches and stops listening when unmounted', async () => {
    const s = shell();
    const b = binding();
    const { unmount } = renderHook(() => useShellPip(b.pip, 1.78));
    await act(async () => undefined);

    unmount();

    expect(s.unlisten).toHaveBeenCalledTimes(1);
    expect(b.calls.attach).toHaveBeenLastCalledWith(null);
  });

  it('drops a listener the shell hands back after unmount', async () => {
    const s = shell();
    const release = s.holdListener();
    const b = binding();
    const { unmount } = renderHook(() => useShellPip(b.pip, 1.78));
    unmount();

    await act(async () => release());

    expect(s.unlisten).toHaveBeenCalledTimes(1);
  });

  it('keeps the window attached when the shell refuses to report on it', async () => {
    const s = shell();
    s.refuseListener();
    const b = binding();

    renderHook(() => useShellPip(b.pip, 1.78));
    await act(async () => undefined);

    expect(b.calls.attach).toHaveBeenCalledTimes(1);
    expect(b.handle()).not.toBeNull();
  });

  it('stays inert in a shell that announced no PiP window', () => {
    shell({ flagged: false });
    const b = binding();

    renderHook(() => useShellPip(b.pip, 1.78));

    expect(b.calls.attach).not.toHaveBeenCalled();
  });
});

describe('useVideoPip', () => {
  it('hands the video to the browser window', async () => {
    pipDocument(true);
    const v = video();
    const b = binding();

    renderHook(() => useVideoPip(b.pip, v.el));
    await b.handle()?.startPictureInPicture();

    expect(v.request).toHaveBeenCalledTimes(1);
  });

  it('leaves the browser window through the document', async () => {
    const exit = pipDocument(true);
    const b = binding();

    renderHook(() => useVideoPip(b.pip, video().el));
    await b.handle()?.stopPictureInPicture();

    expect(exit).toHaveBeenCalledTimes(1);
  });

  it('reports the video entering the browser window', () => {
    pipDocument(true);
    const v = video();
    const b = binding();
    renderHook(() => useVideoPip(b.pip, v.el));

    v.el.dispatchEvent(new Event('enterpictureinpicture'));

    expect(b.calls.onStart).toHaveBeenCalledTimes(1);
  });

  it('reports the video leaving the browser window with whether it still plays', () => {
    pipDocument(true);
    const v = video({ paused: false });
    const b = binding();
    renderHook(() => useVideoPip(b.pip, v.el));

    v.el.dispatchEvent(new Event('leavepictureinpicture'));

    expect(b.calls.onStop).toHaveBeenCalledWith(true);
  });

  it('detaches and stops listening when unmounted', () => {
    pipDocument(true);
    const v = video();
    const b = binding();
    const { unmount } = renderHook(() => useVideoPip(b.pip, v.el));

    unmount();
    v.el.dispatchEvent(new Event('enterpictureinpicture'));

    expect(b.calls.onStart).not.toHaveBeenCalled();
    expect(b.calls.attach).toHaveBeenLastCalledWith(null);
  });

  it('stays inert without a video to hand over', () => {
    pipDocument(true);
    const b = binding();

    renderHook(() => useVideoPip(b.pip, null));

    expect(b.calls.attach).not.toHaveBeenCalled();
  });

  it('stays inert where the document disables picture-in-picture', () => {
    pipDocument(false);
    const b = binding();

    renderHook(() => useVideoPip(b.pip, video().el));

    expect(b.calls.attach).not.toHaveBeenCalled();
  });
});
