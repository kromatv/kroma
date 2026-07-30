import {
  activeKeys,
  type EmitKey,
  freshPadState,
  KEY_NAME,
  type PadState,
  REPEATABLE,
  updateCalibration,
} from './gamepad-map';

// Gamepad -> TV navigation bridge. The 10-foot input model is keyboard-shaped
// (@kroma/tv resolves `keydown`/`keyup` on `window`), so this polls the Gamepad
// API and dispatches the matching synthetic key events.
//
// Debug: `localStorage.setItem('kroma.gamepadDebug', '1')` then reload.

const REPEAT_DELAY_MS = 400;
const REPEAT_EVERY_MS = 120;

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/** Starts translating connected gamepads into TV key events, and returns the
 * stopper. A no-op where the Gamepad API is absent. */
export function startGamepadBridge(): () => void {
  if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') {
    return () => {};
  }
  const debug =
    typeof localStorage !== 'undefined' && localStorage.getItem('kroma.gamepadDebug') === '1';
  const pads = new Map<number, PadState>();
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

  const dumpRaw = (raw: string[]): void => {
    if (!debug) return;
    for (const line of raw.splice(0)) console.debug(line);
  };

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
