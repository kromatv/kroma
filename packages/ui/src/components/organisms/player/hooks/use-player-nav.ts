import type { RemoteKey } from '@kroma/core';
import {
  type SetStateAction,
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from 'react';
import type { ControlId, Overlay, Zone } from '#ui/components/organisms/player/lib/nav';
import { handleDpadKey, handleMediaKey } from '#ui/components/organisms/player/lib/nav-keys';
import type { PlayerCloseReason } from '#ui/components/organisms/player/types';

const HIDE_MS = 3500;

/** Actions the top-level machine invokes; the shell wires them to the controller. */
export interface PlayerNavActions {
  togglePlay(): void;
  /** Discrete seek, -1 = back / +1 = forward (±10 s), from the progress zone or
   *  the rewind/forward transport buttons. */
  seekNudge(dir: -1 | 1): void;
  onNext(): void;
  hasNext: boolean;
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
  zone: Zone;
  overlay: Overlay;
  controls: readonly ControlId[];
  /** The focused control id, or null when the progress zone / a panel is active. */
  focusedControl: ControlId | null;
  /** Route a logical key. The shell calls this after giving any open panel first
   *  refusal. */
  handleKey(key: RemoteKey): void;
  /** Reveal the chrome + (re)arm the auto-hide timer (pointer move / any key). */
  poke(): void;
  openOverlay(o: Exclude<Overlay, null>): void;
  closeOverlay(): void;
  /** Run a control's action (shared by mouse click and D-pad OK). */
  activate(id: ControlId): void;
  /** Mouse focus helpers (hover moves focus, §15). */
  focusControl(id: ControlId): void;
  focusProgress(): void;
}

/**
 * The unified navigation state machine (§3): three-zone D-pad + pointer focus,
 * feature-flag-aware control stops, "▲ from the progress bar hides the UI", and
 * the auto-hiding chrome. It owns zone/overlay/focus; panels manage their own
 * internal focus (see useListFocus / useGridFocus) and the shell routes keys to
 * the open panel first.
 *
 * `controls` must be exactly the row as drawn (see ../lib/metrics
 * `chromeMetrics`): the machine steps through only the controls on screen, so a
 * shed control never keeps a focus stop nobody can see.
 */
export function usePlayerNav(
  playing: boolean,
  actions: PlayerNavActions,
  controls: readonly ControlId[],
): PlayerNav {
  const [revealed, setRevealed] = useState(true);
  const [zone, setZone] = useState<Zone>('controls');
  const [overlay, setOverlay] = useState<Overlay>(null);
  // Focus is a CONTROL, not a slot: the row can change under it (a flag flips,
  // a control is shed), and the button the user was on should stay lit rather
  // than jump to whatever slid into its old index.
  const [focusedId, setFocusedId] = useState<ControlId>('play');
  // ◀ ▶ still move by position: the D-pad steps an index, and this resolves it
  // back to the control that index currently points at.
  const controlIndex = Math.max(0, controls.indexOf(focusedId));
  const setControlIndex = useCallback(
    (update: SetStateAction<number>) => {
      setFocusedId((id) => {
        const from = Math.max(0, controls.indexOf(id));
        const to = typeof update === 'function' ? update(from) : update;
        return controls[Math.min(Math.max(0, to), controls.length - 1)] ?? id;
      });
    },
    [controls],
  );
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

  useEffect(() => {
    if (!playing || overlay) {
      setRevealed(true);
      clearHide();
    } else {
      poke();
    }
    return clearHide;
  }, [playing, overlay, poke, clearHide]);

  const openOverlay = useCallback((o: Exclude<Overlay, null>) => {
    setOverlay(o);
    setRevealed(true);
  }, []);
  const closeOverlay = useCallback(() => setOverlay(null), []);

  const focusControl = useCallback(
    (id: ControlId) => {
      if (!controls.includes(id)) return;
      setZone('controls');
      setFocusedId(id);
    },
    [controls],
  );
  const focusProgress = useCallback(() => setZone('progress'), []);

  const activate = useEffectEvent((id: ControlId) => {
    const a = actions;
    switch (id) {
      case 'rewind':
        return a.seekNudge(-1);
      case 'play':
        return a.togglePlay();
      case 'forward':
        return a.seekNudge(1);
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
    if (handleMediaKey(key, actions)) return;

    // While hidden, the first key just brings the chrome back (§3, §16).
    if (!revealed) {
      poke();
      return;
    }
    poke();

    // An open panel had first refusal (shell); here we only close it on Back.
    if (overlay) {
      if (key === 'Back') closeOverlay();
      return;
    }

    handleDpadKey(key, {
      a: actions,
      zone,
      focused: controls[controlIndex],
      controlsLen: controls.length,
      setZone,
      setControlIndex,
      setRevealed,
      clearHide,
      openOverlay,
      activate,
    });
  });

  const focusedControl =
    !overlay && revealed && zone === 'controls' ? (controls[controlIndex] ?? null) : null;

  return {
    revealed,
    zone,
    overlay,
    controls,
    focusedControl,
    handleKey,
    poke,
    openOverlay,
    closeOverlay,
    activate,
    focusControl,
    focusProgress,
  };
}
