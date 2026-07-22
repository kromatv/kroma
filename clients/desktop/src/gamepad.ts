import {
  activeKeys,
  type EmitKey,
  freshPadState,
  KEY_NAME,
  type PadState,
  REPEATABLE,
  updateCalibration,
} from './gamepad-map';

// Gamepad -> TV navigation bridge (@kroma/desktop; Steam Deck the primary target).
//
// The shared @kroma/tv nav (useFocusNav) and player (usePlayerControls,
// useDirectPlayback) all listen for `keydown` / `keyup` on `window` and normalize
// them with `resolveRemoteKey` (packages/core/src/remote.ts), which resolves by
// `KeyboardEvent.key` first. So the entire 10-foot input model is already
// keyboard-shaped: we just poll the Gamepad API and dispatch the matching synthetic
// key events on `window`. Nothing in @kroma/tv has to change. All the messy
// per-layout decoding (raw evdev pads, hat-axis D-pads, analog triggers) lives in
// gamepad-map.ts.
//
// Debug: `localStorage.setItem('kroma.gamepadDebug', '1')` then reload logs every
// emitted key with a raw button/axis snapshot; connect info is always logged.

const REPEAT_DELAY_MS = 400; // hold this long before the first auto-repeat
const REPEAT_EVERY_MS = 120; // then repeat this often

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/**
 * Start translating connected gamepads into TV key events. Safe to call once at
 * boot; a no-op (returns an empty stopper) where the Gamepad API is absent.
 * Returns a stop function.
 */
export function startGamepadBridge(): () => void {
  if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') {
    return () => {};
  }
  const debug =
    typeof localStorage !== 'undefined' && localStorage.getItem('kroma.gamepadDebug') === '1';
  const pads = new Map<number, PadState>();
  // Per-key hold state: when its next auto-repeat is due.
  const held = new Map<EmitKey, { nextRepeat: number }>();
  let raf = 0;
  let stopped = false;

  const fire = (type: 'keydown' | 'keyup', k: EmitKey, repeat: boolean): void => {
    if (debug && !repeat) console.debug(`[gamepad] ${type} ${KEY_NAME[k]}`);
    window.dispatchEvent(
      new KeyboardEvent(type, { key: KEY_NAME[k], bubbles: true, cancelable: true, repeat }),
    );
  };

  const stateFor = (pad: Gamepad): PadState => {
    let state = pads.get(pad.index);
    if (state?.id !== pad.id) {
      state = freshPadState(pad.id);
      pads.set(pad.index, state);
      console.info(
        `[gamepad] connected "${pad.id}" mapping=${pad.mapping || 'none'} ` +
          `${pad.buttons.length} buttons ${pad.axes.length} axes`,
      );
    }
    return state;
  };

  const rawSnapshot = (pad: Gamepad): string => {
    const btns = pad.buttons.flatMap((b, i) => (b.pressed || b.value > 0.05 ? [i] : []));
    const axes = pad.axes.map((v) => v.toFixed(2)).join(',');
    return `[gamepad] raw pad${pad.index} buttons=[${btns.join(',')}] axes=[${axes}]`;
  };

  // A fresh press is the interesting moment for layout debugging: dump the raw pad
  // snapshots collected this frame (once per frame, not per held frame).
  const dumpRaw = (raw: string[]): void => {
    if (!debug) return;
    for (const line of raw.splice(0)) console.debug(line);
  };

  // Poll every connected pad: collect the keys currently active across all of them,
  // forget the states of pads that went away, and append this frame's debug snapshots.
  const pollPads = (raw: string[]): Set<EmitKey> => {
    const active = new Set<EmitKey>();
    const seen = new Set<number>();
    for (const pad of navigator.getGamepads()) {
      if (!pad) continue;
      seen.add(pad.index);
      const state = stateFor(pad);
      updateCalibration(pad, state);
      for (const k of activeKeys(pad, state)) active.add(k);
      if (debug) raw.push(rawSnapshot(pad));
    }
    for (const index of pads.keys()) {
      if (!seen.has(index)) pads.delete(index);
    }
    return active;
  };

  // Newly pressed -> keydown; still-held repeatable key past its due time -> repeat.
  const emitPresses = (active: Set<EmitKey>, raw: string[], t: number): void => {
    for (const k of active) {
      const state = held.get(k);
      if (!state) {
        dumpRaw(raw);
        fire('keydown', k, false);
        held.set(k, { nextRepeat: t + REPEAT_DELAY_MS });
      } else if (REPEATABLE.has(k) && t >= state.nextRepeat) {
        fire('keydown', k, true);
        state.nextRepeat = t + REPEAT_EVERY_MS;
      }
    }
  };

  // Released -> keyup (drives e.g. the player's commit-seek-on-release).
  const emitReleases = (active: Set<EmitKey>): void => {
    for (const k of held.keys()) {
      if (!active.has(k)) {
        fire('keyup', k, false);
        held.delete(k);
      }
    }
  };

  const tick = () => {
    if (stopped) return;
    const raw: string[] = [];
    const active = pollPads(raw);
    const t = now();
    emitPresses(active, raw, t);
    emitReleases(active);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
  };
}
