// Picture-in-picture on the browser targets. A `<video>` floats through the
// browser's own API; the desktop shell's mpv picture has no element, so the
// shell floats its GL view in the system window and says when that window
// opens and closes.

import { webDocument } from '@kromatv/ui/kit';
import { useEffect } from 'react';
import { z } from 'zod';
import { getTauri, type Surface } from '#tv/features/playback/player/engine';
import type { PipBinding } from '#tv/features/playback/player/playbackBackend';

const PipChanged = z.object({ active: z.boolean(), playing: z.boolean() });

function shellPip(): boolean {
  return getTauri() != null && '__KROMA_PIP__' in globalThis;
}

function videoPip(): boolean {
  return webDocument()?.pictureInPictureEnabled === true;
}

/** Whether `surface` can hand its picture to a picture-in-picture window here. */
export function browserPictureInPicture(surface: Surface): boolean {
  if (surface === 'mpv') return shellPip();
  if (surface === 'video') return videoPip();
  return false;
}

/** Binds the shell's mpv picture to `pip` for as long as the surface is mounted. */
export function useShellPip(pip: PipBinding, aspect: number | undefined): void {
  const { attach, onStart, onStop } = pip;
  useEffect(() => {
    const bridge = getTauri();
    if (!bridge || !shellPip()) return;
    attach({
      startPictureInPicture: () =>
        bridge.core.invoke('pip_start', { aspect: aspect ?? 16 / 9 }).then(() => undefined),
      stopPictureInPicture: () => bridge.core.invoke('pip_stop').then(() => undefined),
    });
    let un: (() => void) | undefined;
    let dead = false;
    void bridge.event
      .listen('pip-changed', (e) => {
        const change = PipChanged.safeParse(e.payload);
        if (!change.success) return;
        if (change.data.active) onStart();
        else onStop(change.data.playing);
      })
      .then((u) => {
        if (dead) u();
        else un = u;
      })
      .catch(() => undefined);
    return () => {
      dead = true;
      un?.();
      attach(null);
    };
  }, [attach, onStart, onStop, aspect]);
}

/** Binds a `<video>` to `pip` through the browser's picture-in-picture API. */
export function useVideoPip(pip: PipBinding, video: HTMLVideoElement | null): void {
  const { attach, onStart, onStop } = pip;
  useEffect(() => {
    const doc = webDocument();
    if (!video || !doc || !videoPip()) return;
    attach({
      startPictureInPicture: () => video.requestPictureInPicture().then(() => undefined),
      stopPictureInPicture: () => doc.exitPictureInPicture(),
    });
    const entered = () => onStart();
    const left = () => onStop(!video.paused);
    video.addEventListener('enterpictureinpicture', entered);
    video.addEventListener('leavepictureinpicture', left);
    return () => {
      video.removeEventListener('enterpictureinpicture', entered);
      video.removeEventListener('leavepictureinpicture', left);
      attach(null);
    };
  }, [attach, onStart, onStop, video]);
}
