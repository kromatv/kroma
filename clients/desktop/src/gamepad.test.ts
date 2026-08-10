// @vitest-environment jsdom
//
// The gamepad -> TV key bridge.
//
// The whole design is that nothing downstream knows a gamepad exists: the nav
// and the player already listen for `keydown`/`keyup` on `window`, so this
// polls the pad and dispatches the matching synthetic events. What is worth
// pinning is the HOLD behaviour, because both halves of it are felt rather than
// seen. A d-pad held down has to auto-repeat or a long list cannot be walked;
// Enter held down must NOT, or one press selects several times. And every press
// needs its `keyup`, because that is what commits a seek when the user lets go.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startGamepadBridge } from './gamepad';

const REPEAT_DELAY_MS = 400;
const REPEAT_EVERY_MS = 120;

function pad(pressed: number[] = [], id = 'Test Pad', index = 0): Gamepad {
  return {
    id,
    index,
    mapping: 'standard',
    connected: true,
    timestamp: 0,
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, (_, i) => ({
      pressed: pressed.includes(i),
      touched: pressed.includes(i),
      value: pressed.includes(i) ? 1 : 0,
    })),
  } as unknown as Gamepad;
}

const A = 0;
const B = 1;
const DPAD_UP = 12;

let frame: (() => void) | null = null;
let clock = 0;
let keys: KeyboardEvent[] = [];
const record = (e: Event) => keys.push(e as KeyboardEvent);

function tick(ms = 16) {
  clock += ms;
  const run = frame;
  frame = null;
  run?.();
}

function setPads(...gamepads: (Gamepad | null)[]) {
  vi.stubGlobal('navigator', {
    ...navigator,
    getGamepads: () => gamepads,
  });
}

function livePad() {
  let current: Gamepad | null = pad([]);
  vi.stubGlobal('navigator', { ...navigator, getGamepads: () => [current] });
  return {
    set(next: Gamepad | null) {
      current = next;
    },
  };
}

// A button is only decoded once it has been seen at rest, so every press test
// has to calibrate first.
function calibrate() {
  tick();
  keys = [];
}

beforeEach(() => {
  frame = null;
  clock = 0;
  keys = [];
  vi.stubGlobal('requestAnimationFrame', (cb: () => void) => {
    frame = cb;
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {
    frame = null;
  });
  vi.stubGlobal('performance', { now: () => clock });
  window.addEventListener('keydown', record);
  window.addEventListener('keyup', record);
});

afterEach(() => {
  // Removed, not merely re-added: window outlives the test, so a listener left
  // behind records every later test's events too and each assertion sees the
  // right key followed by a growing tail of duplicates.
  window.removeEventListener('keydown', record);
  window.removeEventListener('keyup', record);
  vi.unstubAllGlobals();
});

const names = () => keys.map((e) => `${e.type}:${e.key}${e.repeat ? '*' : ''}`);

describe('startGamepadBridge', () => {
  it('is a no-op where the Gamepad API does not exist', () => {
    vi.stubGlobal('navigator', {});
    const stop = startGamepadBridge();
    // A stopper is still returned, so the caller needs no capability check.
    expect(typeof stop).toBe('function');
    expect(() => stop()).not.toThrow();
  });

  it('ignores a button already held when the pad connects', () => {
    // A pad that reports a stuck button at connect must not walk the menu. The
    // button is decoded only after it has been seen released at least once.
    setPads(pad([DPAD_UP]));
    startGamepadBridge();
    tick();
    tick();
    expect(names()).toEqual([]);
  });

  it('turns a fresh press into a keydown the nav already understands', () => {
    const live = livePad();
    startGamepadBridge();
    calibrate();
    live.set(pad([DPAD_UP]));
    tick();
    // ArrowUp, not some gamepad-shaped event: nothing downstream knows a pad
    // was involved.
    expect(names()).toContain('keydown:ArrowUp');
  });

  it('does not re-fire a press that is merely still held', () => {
    const live = livePad();
    startGamepadBridge();
    calibrate();
    live.set(pad([DPAD_UP]));
    tick();
    keys = [];
    tick();
    tick();
    expect(names()).toEqual([]);
  });

  it('auto-repeats a held d-pad, but only after the delay', () => {
    const live = livePad();
    startGamepadBridge();
    calibrate();
    live.set(pad([DPAD_UP]));
    tick();
    keys = [];

    tick(REPEAT_DELAY_MS - 50);
    expect(names()).toEqual([]);

    // Past the delay the repeats start, and they are marked as repeats so a
    // listener can tell them from a deliberate second press.
    tick(100);
    expect(names()).toEqual(['keydown:ArrowUp*']);

    keys = [];
    tick(REPEAT_EVERY_MS);
    expect(names()).toEqual(['keydown:ArrowUp*']);
  });

  it('never repeats a select press, however long it is held', () => {
    const live = livePad();
    startGamepadBridge();
    calibrate();
    live.set(pad([A]));
    tick();
    keys = [];
    // Enter is not repeatable: one press must select once, not once per frame
    // for as long as a thumb rests on the button.
    tick(REPEAT_DELAY_MS + REPEAT_EVERY_MS * 5);
    expect(names()).toEqual([]);
  });

  it('emits keyup on release, which is what commits a seek', () => {
    const live = livePad();
    startGamepadBridge();
    calibrate();
    live.set(pad([DPAD_UP]));
    tick();
    keys = [];
    live.set(pad([]));
    tick();
    expect(names()).toEqual(['keyup:ArrowUp']);
  });

  it('releases a key when the pad disappears entirely', () => {
    const live = livePad();
    startGamepadBridge();
    calibrate();
    live.set(pad([DPAD_UP]));
    tick();
    keys = [];
    live.set(null);
    tick();
    // Unplugging mid-press must not leave the nav believing a direction is
    // still down.
    expect(names()).toEqual(['keyup:ArrowUp']);
  });

  it('reads several pads at once', () => {
    let pads: (Gamepad | null)[] = [pad([], 'One', 0), pad([], 'Two', 1)];
    vi.stubGlobal('navigator', { ...navigator, getGamepads: () => pads });
    startGamepadBridge();
    calibrate();
    pads = [pad([DPAD_UP], 'One', 0), pad([B], 'Two', 1)];
    tick();
    expect(names()).toContain('keydown:ArrowUp');
    expect(names()).toContain('keydown:Escape');
  });

  it('falls back to the wall clock where performance.now is absent', () => {
    vi.stubGlobal('performance', undefined);
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValue(0);
    const live = livePad();
    startGamepadBridge();
    calibrate();
    live.set(pad([DPAD_UP]));
    tick();
    keys = [];

    now.mockReturnValue(REPEAT_DELAY_MS + 1);
    tick();
    expect(names()).toEqual(['keydown:ArrowUp*']);
    now.mockRestore();
  });

  it('says nothing on the console until the debug flag is set', () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    vi.stubGlobal('localStorage', { getItem: () => null });
    const live = livePad();
    startGamepadBridge();
    calibrate();
    live.set(pad([DPAD_UP]));
    tick();
    expect(debug).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('dumps the raw pad state alongside the key it decoded when debugging', () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => (key === 'kroma.gamepadDebug' ? '1' : null),
    });

    const live = livePad();
    startGamepadBridge();
    calibrate();
    live.set(pad([DPAD_UP]));
    tick();

    const lines = debug.mock.calls.map(([line]) => String(line));
    expect(lines.some((line) => line.includes('buttons=[12]'))).toBe(true);
    expect(lines).toContain('[gamepad] keydown ArrowUp');

    debug.mockClear();
    tick(REPEAT_DELAY_MS + 1);
    expect(debug).not.toHaveBeenCalled();

    vi.restoreAllMocks();
  });

  it('re-reads a pad that was swapped for another at the same index', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    let current = pad([], 'First Pad', 0);
    vi.stubGlobal('navigator', { ...navigator, getGamepads: () => [current] });
    startGamepadBridge();
    calibrate();

    current = pad([DPAD_UP], 'Second Pad', 0);
    tick();
    expect(names()).toEqual([]);
    expect(info.mock.calls.map(([line]) => String(line)).join(' ')).toContain('Second Pad');
    vi.restoreAllMocks();
  });

  it('stops polling once stopped', () => {
    const live = livePad();
    const stop = startGamepadBridge();
    calibrate();
    live.set(pad([DPAD_UP]));
    tick();
    keys = [];
    stop();
    // The loop is cancelled: no further frame was scheduled.
    expect(frame).toBeNull();
  });
});
