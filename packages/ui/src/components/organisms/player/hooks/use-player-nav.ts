import type { Direction } from '@kromatv/spatial-nav';
import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import type { SeekPress } from '#ui/components/organisms/player/hooks/use-seek-nudge';
import type { ControlId, Overlay, Spot } from '#ui/components/organisms/player/lib/nav';
import {
  handleMediaKey,
  PLAY_KEYS,
  QUIET_KEYS,
} from '#ui/components/organisms/player/lib/nav-keys';
import type { PlayerCloseReason } from '#ui/components/organisms/player/types';
import type { RemoteKey } from '#ui/lib/remote-keys';
import { useStableCallback } from '#ui/lib/stable-callback';

const HIDE_MS = 3500;

/** Actions the top-level machine invokes; the shell wires them to the controller. */
export interface PlayerNavActions {
  togglePlay(): void;
  /** Directional seek, -1 = back / +1 = forward, from the seek bar or the
   *  rewind/forward transport buttons. */
  seekNudge(dir: -1 | 1, press: SeekPress): void;
  onNext(): void;
  hasNext: boolean;
  sheetHasItems: boolean;
  /** Volume ±5 % (§4b) when the volume control is focused. */
  volumeNudge(dir: -1 | 1): void;
  toggleMute(): void;
  togglePip(): void;
  toggleFullscreen(): void;
  /** Hand this film to a TV. Only reachable when `flags.cast` is on, which the
   *  host sets while a receiver is live. */
  onCast?(): void;
  /** Leave the player, told why: OK on the back button, Back at the top level,
   *  or the Stop media key. */
  onExit(reason: PlayerCloseReason): void;
}

export interface PlayerNav {
  revealed: boolean;
  overlay: Overlay;
  controls: readonly ControlId[];
  /** Where in the chrome the navigator's focus is, or null when it is elsewhere. */
  spot: Spot | null;
  /** The keys the navigator does not walk: the media keys and Back. */
  handleKey(key: RemoteKey): void;
  /** The chrome's answer to a press before the navigator moves (see `onKey`):
   *  a hidden chrome comes back on the first press and keeps it. */
  chromeKey(direction: Direction): boolean;
  /** Reveal the chrome + (re)arm the auto-hide timer (pointer move / any key). */
  poke(): void;
  /** Re-arm the auto-hide timer WITHOUT revealing the chrome. Used by immersive
   *  media shortcuts so repeated arrow presses don't flash the UI. */
  rearmHide(): void;
  openOverlay(o: Exclude<Overlay, null>): void;
  closeOverlay(): void;
  /** Run a control's action, whether OK or a click pressed it. */
  activate(id: ControlId): void;
  /** Where the navigator's focus landed in the chrome, reported by the part it landed on. */
  focus(spot: Spot): void;
  /** The part that held the focus lost it. */
  blur(spot: Spot): void;
  /** Leave the player, told why, without going through the key chain. */
  exit(reason: PlayerCloseReason): void;
}

/**
 * What the player decides about its chrome (§3): whether it is shown and for how
 * long, which panel is open, what each control does, and what Back and the media
 * keys mean. WHERE the focus is, and where a direction takes it, is the
 * navigator's, as on every other screen; the chrome's parts report it here.
 *
 * `controls` must be exactly the row as drawn (see ../lib/metrics `chromeMetrics`).
 */
export function usePlayerNav(
  playing: boolean,
  actions: PlayerNavActions,
  controls: readonly ControlId[],
): PlayerNav {
  const [revealed, setRevealed] = useState(true);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [spot, setSpot] = useState<Spot | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHide = useCallback(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }, []);

  const poke = useCallback(() => {
    setRevealed(true);
    clearHide();
    if (!playing || overlay) return;
    hideTimer.current = setTimeout(() => setRevealed(false), HIDE_MS);
  }, [clearHide, playing, overlay]);

  const rearmHide = useCallback(() => {
    clearHide();
    if (!playing || overlay) return;
    hideTimer.current = setTimeout(() => setRevealed(false), HIDE_MS);
  }, [clearHide, playing, overlay]);

  const hide = useCallback(() => {
    clearHide();
    setRevealed(false);
  }, [clearHide]);

  const [chromeKeyOf, setChromeKeyOf] = useState({ playing, overlay });
  const [quietToggle, setQuietToggle] = useState(false);
  if (chromeKeyOf.playing !== playing || chromeKeyOf.overlay !== overlay) {
    const keptHidden = quietToggle && chromeKeyOf.overlay === overlay;
    setChromeKeyOf({ playing, overlay });
    if (keptHidden) setQuietToggle(false);
    else setRevealed(true);
  }

  useEffect(() => {
    clearHide();
    if (playing && !overlay) rearmHide();
    return clearHide;
  }, [playing, overlay, rearmHide, clearHide]);

  const openOverlay = useCallback((o: Exclude<Overlay, null>) => {
    setOverlay(o);
    setRevealed(true);
  }, []);
  const closeOverlay = useCallback(() => setOverlay(null), []);

  const focus = useCallback((at: Spot) => setSpot(at), []);
  const blur = useCallback((at: Spot) => setSpot((was) => (was === at ? null : was)), []);
  const exit = useEffectEvent((reason: PlayerCloseReason) => actions.onExit(reason));

  const activate = useStableCallback((id: ControlId) => {
    const a = actions;
    switch (id) {
      case 'rewind':
        return a.seekNudge(-1, 'tap');
      case 'play':
        return a.togglePlay();
      case 'forward':
        return a.seekNudge(1, 'tap');
      case 'next':
        return a.onNext();
      case 'volume':
        return a.toggleMute();
      case 'subtitles':
        return setOverlay('subtitles');
      case 'audio':
        return setOverlay('audio');
      case 'settings':
        return setOverlay('settings');
      case 'cast':
        return a.onCast?.();
      case 'pip':
        return a.togglePip();
      case 'fullscreen':
        return a.toggleFullscreen();
    }
  });

  const handleKey = useEffectEvent((key: RemoteKey) => {
    if (handleMediaKey(key, actions)) {
      if (revealed || !QUIET_KEYS.has(key)) {
        poke();
        return;
      }
      if (PLAY_KEYS.has(key)) setQuietToggle(true);
      rearmHide();
      return;
    }
    if (key !== 'Back') return;
    if (overlay) {
      closeOverlay();
      return;
    }
    if (revealed) hide();
    else actions.onExit('back');
  });

  const chromeKey = useEffectEvent((direction: Direction): boolean => {
    if (!revealed) {
      if (spot === 'skip') return false;
      poke();
      return true;
    }
    poke();
    if (direction === 'up' && spot === 'back') {
      hide();
      return true;
    }
    if (direction === 'down' && spot !== null && controls.includes(spot as ControlId)) {
      if (actions.sheetHasItems) openOverlay('sheet');
      return true;
    }
    return false;
  });

  return {
    revealed,
    overlay,
    controls,
    spot,
    handleKey,
    chromeKey,
    poke,
    rearmHide,
    openOverlay,
    closeOverlay,
    activate,
    focus,
    blur,
    exit,
  };
}
