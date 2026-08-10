import type { RemoteKey } from '@kroma/core';
import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { ControlId, Overlay, Zone } from '../lib/nav';

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
  /** Leave the player (Back at the top level, or the Stop media key). */
  onExit(): void;
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

interface DpadContext {
  a: PlayerNavActions;
  zone: Zone;
  focused: ControlId | undefined;
  controlsLen: number;
  setZone: Dispatch<SetStateAction<Zone>>;
  setControlIndex: Dispatch<SetStateAction<number>>;
  setRevealed: Dispatch<SetStateAction<boolean>>;
  clearHide: () => void;
  openOverlay: (o: Exclude<Overlay, null>) => void;
  activate: (id: ControlId) => void;
}

function handleMediaKey(key: RemoteKey, a: PlayerNavActions): boolean {
  switch (key) {
    case 'Play':
    case 'Pause':
    case 'PlayPause':
      a.togglePlay();
      return true;
    case 'Next':
      a.onNext();
      return true;
    case 'Prev':
    case 'Rewind':
      a.seekNudge(-1);
      return true;
    case 'FastForward':
      a.seekNudge(1);
      return true;
    case 'Stop':
      a.onExit();
      return true;
    default:
      return false;
  }
}

function dpadUp(ctx: DpadContext): void {
  const { a, zone, focused } = ctx;
  if (zone === 'controls') {
    if (focused === 'volume') {
      a.volumeNudge(1);
      return;
    }
    ctx.setZone('progress');
  } else if (zone === 'progress') {
    ctx.setZone('back');
  } else {
    // Above the Back button there is nothing left to focus, so ▲ dismisses the
    // chrome, which is what it did from `progress` before this zone existed.
    ctx.clearHide();
    ctx.setRevealed(false);
  }
}

function dpadDown(ctx: DpadContext): void {
  const { a, zone, focused } = ctx;
  if (zone === 'back') ctx.setZone('progress');
  else if (zone === 'progress') ctx.setZone('controls');
  else if (focused === 'volume') a.volumeNudge(-1);
  else ctx.openOverlay('sheet');
}

function handleDpadKey(key: RemoteKey, ctx: DpadContext): void {
  const { a, zone, focused } = ctx;
  switch (key) {
    case 'Up':
      dpadUp(ctx);
      return;
    case 'Down':
      dpadDown(ctx);
      return;
    case 'Left':
      if (zone === 'progress') a.seekNudge(-1);
      else ctx.setControlIndex((i) => Math.max(0, i - 1));
      return;
    case 'Right':
      if (zone === 'progress') a.seekNudge(1);
      else ctx.setControlIndex((i) => Math.min(ctx.controlsLen - 1, i + 1));
      return;
    case 'Enter':
      if (zone === 'back') a.onExit();
      else if (zone === 'progress') a.togglePlay();
      else if (focused) ctx.activate(focused);
      return;
    case 'Back':
      a.onExit();
      return;
  }
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
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  const clearHide = useCallback(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }, []);

  const poke = useCallback(() => {
    setRevealed(true);
    clearHide();
    // Only fade out while actually playing and with no panel open.
    hideTimer.current = setTimeout(() => setRevealed(false), HIDE_MS);
  }, [clearHide]);

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

  const activate = useCallback((id: ControlId) => {
    const a = actionsRef.current;
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
  }, []);

  const handleKey = useCallback(
    (key: RemoteKey) => {
      const a = actionsRef.current;
      if (handleMediaKey(key, a)) return;

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
        a,
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
    },
    [
      revealed,
      overlay,
      zone,
      controls,
      controlIndex,
      poke,
      clearHide,
      openOverlay,
      closeOverlay,
      activate,
      setControlIndex,
    ],
  );

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
