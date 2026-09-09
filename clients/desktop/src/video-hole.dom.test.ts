// @vitest-environment jsdom
import {
  PLAYER_PICTURE_ID,
  PLAYER_ROOT_ID,
  PLAYER_STAGE_ID,
  PLAYER_SUBTITLE_ID,
} from '@kromatv/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installVideoHole, nativePlane } from './video-hole';

type Call = [string, Record<string, unknown> | undefined];

function place(el: HTMLElement, left: number, top: number, right: number, bottom: number) {
  el.getBoundingClientRect = () =>
    ({
      left,
      top,
      right,
      bottom,
      width: right - left,
      height: bottom - top,
      x: left,
      y: top,
    }) as DOMRect;
}

function div(parent: HTMLElement, id?: string): HTMLElement {
  const el = document.createElement('div');
  if (id) el.id = id;
  parent.appendChild(el);
  return el;
}

// jsdom's requestAnimationFrame needs a visual mode; a timer is enough here.
function frames(): void {
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) =>
    setTimeout(() => cb(performance.now()), 1),
  );
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

describe('nativePlane', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('is the Linux shell, not Android', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' });
    expect(nativePlane()).toBe(true);
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Linux; Android 14)' });
    expect(nativePlane()).toBe(false);
  });
});

describe('installVideoHole', () => {
  let calls: Call[];

  beforeEach(() => {
    calls = [];
    document.body.innerHTML = '';
    frames();
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' });
    vi.stubGlobal('__TAURI__', {
      core: {
        invoke: (cmd: string, args?: Record<string, unknown>) => {
          calls.push([cmd, args]);
          return Promise.resolve();
        },
      },
    });
    Object.defineProperty(window, 'innerWidth', { value: 1000, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 500, configurable: true });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('does nothing without the shell bridge', async () => {
    vi.stubGlobal('__TAURI__', undefined);
    installVideoHole();
    div(document.body, PLAYER_STAGE_ID);
    await settle();
    expect(calls).toEqual([]);
  });

  it('shapes the plane to the picture minus the painted chrome, and points mpv at it', async () => {
    const root = div(document.body, PLAYER_ROOT_ID);
    const stage = div(root, PLAYER_STAGE_ID);
    place(stage, 0, 0, 1000, 500);
    const picture = div(stage, PLAYER_PICTURE_ID);
    place(picture, 100, 50, 900, 450);
    const chrome = div(root);
    chrome.style.position = 'absolute';
    const button = div(chrome);
    button.style.backgroundColor = 'rgb(10, 10, 12)';
    place(button, 100, 400, 300, 450);
    const air = div(chrome);
    place(air, 0, 0, 1000, 500);
    const mask = div(root);
    mask.style.position = 'absolute';
    mask.style.boxShadow = '0 0 0 100vmax #000';
    place(mask, 100, 50, 900, 450);
    const cue = div(stage, PLAYER_SUBTITLE_ID);
    const text = div(cue);
    text.textContent = 'Bonjour';
    place(text, 400, 300, 600, 340);

    installVideoHole();
    await settle();

    const hole = calls.find(([cmd]) => cmd === 'video_hole_set')?.[1];
    expect(hole?.rect).toEqual({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 });
    expect(hole?.covers).toEqual([
      { x: 0.1, y: 0.8, w: 0.2, h: 0.1 },
      { x: 0.4, y: 0.6, w: 0.2, h: 0.08 },
    ]);
    const margins = Object.fromEntries(
      calls
        .filter(([cmd]) => cmd === 'mpv_command')
        .map(([, args]) => args?.args as [string, string, number])
        .map(([, prop, value]) => [prop, value]),
    );
    for (const side of ['left', 'right', 'top', 'bottom']) {
      expect(margins[`video-margin-ratio-${side}`]).toBeCloseTo(0.1, 6);
    }
  });

  it('drops a faded layer, follows the picture, and hides the plane when the player leaves', async () => {
    const root = div(document.body, PLAYER_ROOT_ID);
    const stage = div(root, PLAYER_STAGE_ID);
    place(stage, 0, 0, 1000, 500);
    const chrome = div(root);
    chrome.style.position = 'absolute';
    chrome.style.opacity = '0';
    const button = div(chrome);
    button.style.backgroundColor = 'rgb(10, 10, 12)';
    place(button, 0, 400, 1000, 500);

    installVideoHole();
    await settle();
    const shapes = () => calls.filter(([cmd]) => cmd === 'video_hole_set').map(([, a]) => a);
    expect(shapes().at(-1)).toEqual({ rect: { x: 0, y: 0, w: 1, h: 1 }, covers: [] });

    chrome.style.opacity = '1';
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(shapes().at(-1)?.covers).toEqual([{ x: 0, y: 0.8, w: 1, h: 0.2 }]);

    stage.remove();
    await settle();
    expect(shapes().at(-1)).toEqual({ rect: null, covers: [] });
  });
});
