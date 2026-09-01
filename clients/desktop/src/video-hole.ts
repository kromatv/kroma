// WebKitGTK paints an opaque background whatever alpha the page or the window
// asks for (measured on SteamOS 3.8: an rgba(0,0,255,0.5) body came back as solid
// rgb(0,0,250) over magenta), so the mpv plane behind a "transparent" Tauri window
// is never visible. What IS visible is a hole: the X SHAPE extension cuts the
// picture's box out of the window and the plane below shows through it, with no
// alpha and no compositing manager involved.
//
// A pixel inside the hole belongs to mpv's window, so the page cannot draw there
// at all. The chrome is therefore measured and handed over as COVERS, and the
// shell puts those rectangles back into the window's shape: video everywhere in
// the picture's box except where the chrome actually paints, chrome everywhere
// else. What is measured is a layer's painted leaves, not its box - the chrome is
// laid out as full-stage containers, and cutting the hole around those would hide
// the picture behind transparent air.

import { PLAYER_ROOT_ID, PLAYER_STAGE_ID, PLAYER_SUBTITLE_ID } from '@kroma/ui';

/** A box in window pixels, the shape `getBoundingClientRect` returns. */
export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** A rectangle as fractions of the window, as the shell and mpv both take it. */
export interface HoleRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The picture's box and the chrome painted over it, ready for the window shape. */
export interface HoleShape {
  rect: HoleRect;
  covers: HoleRect[];
}

const MIN_SIDE_PX = 16;
const VISIBLE_OPACITY = 0.02;

function area(box: Box): number {
  return Math.max(0, box.right - box.left) * Math.max(0, box.bottom - box.top);
}

function intersects(a: Box, b: Box): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

function clip(box: Box, to: Box): Box {
  return {
    left: Math.max(box.left, to.left),
    top: Math.max(box.top, to.top),
    right: Math.min(box.right, to.right),
    bottom: Math.min(box.bottom, to.bottom),
  };
}

/** The smallest box holding every box given, or `null` for none. */
export function union(boxes: readonly Box[]): Box | null {
  let out: Box | null = null;
  for (const box of boxes) {
    if (area(box) <= 0) continue;
    out = out
      ? {
          left: Math.min(out.left, box.left),
          top: Math.min(out.top, box.top),
          right: Math.max(out.right, box.right),
          bottom: Math.max(out.bottom, box.bottom),
        }
      : box;
  }
  return out;
}

function fraction(box: Box, width: number, height: number): HoleRect {
  return {
    x: box.left / width,
    y: box.top / height,
    w: (box.right - box.left) / width,
    h: (box.bottom - box.top) / height,
  };
}

/**
 * The window shape for a picture at `stage` with `covers` painted over it, as
 * fractions of a `width` x `height` window. `null` when the window is unmeasured
 * or the picture is too small to be worth cutting.
 */
export function holeShape(
  stage: Box,
  covers: readonly Box[],
  width: number,
  height: number,
): HoleShape | null {
  if (!(width > 0 && height > 0)) return null;
  const window: Box = { left: 0, top: 0, right: width, bottom: height };
  const box = clip(stage, window);
  if (box.right - box.left < MIN_SIDE_PX || box.bottom - box.top < MIN_SIDE_PX) return null;
  const kept: HoleRect[] = [];
  for (const cover of covers) {
    if (!intersects(box, cover)) continue;
    const inside = clip(cover, box);
    if (area(inside) > 0) kept.push(fraction(inside, width, height));
  }
  return { rect: fraction(box, width, height), covers: kept };
}

/** Whether two shapes differ by more than a pixel's worth of the window. */
export function moved(a: HoleShape | null, b: HoleShape | null): boolean {
  if (a === null || b === null) return a !== b;
  if (a.covers.length !== b.covers.length) return true;
  const step = 1 / 4096;
  const apart = (x: HoleRect, y: HoleRect) =>
    Math.abs(x.x - y.x) > step ||
    Math.abs(x.y - y.y) > step ||
    Math.abs(x.w - y.w) > step ||
    Math.abs(x.h - y.h) > step;
  if (apart(a.rect, b.rect)) return true;
  return a.covers.some((cover, i) => {
    const other = b.covers[i];
    return other === undefined || apart(cover, other);
  });
}

type Invoke = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;

function tauriInvoke(): Invoke | null {
  const bridge = (globalThis as { __TAURI__?: { core?: { invoke?: Invoke } } }).__TAURI__;
  return bridge?.core?.invoke ?? null;
}

function boxOf(el: Element): Box {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
}

function opacityOf(el: Element): number {
  const style = getComputedStyle(el);
  if (style.visibility === 'hidden' || style.display === 'none') return 0;
  return Number.parseFloat(style.opacity || '1');
}

// What a pixel of chrome actually comes from: a fill, an edge, or a glyph. A
// container that only positions its children paints nothing and must not be
// treated as chrome, or the hole would be cut around empty air.
function paints(el: Element): boolean {
  const style = getComputedStyle(el);
  if (style.backgroundImage !== 'none' || style.boxShadow !== 'none') return true;
  if (!/^(rgba?\(0, 0, 0, 0\)|transparent)$/.test(style.backgroundColor)) return true;
  if (Number.parseFloat(style.borderTopWidth) + Number.parseFloat(style.borderLeftWidth) > 0) {
    return true;
  }
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) return true;
  }
  return false;
}

interface Layer {
  root: HTMLElement;
  leaves: HTMLElement[];
}

// The chrome is a handful of absolutely-positioned layers beside the stage, each
// fading as a whole; the cue band is inside the stage and unmounts with its cue.
// Enumerating their painted leaves is a whole-subtree walk, so it runs on a DOM
// change and not on the frame loop, which only re-reads what it is left holding.
function chromeLayers(root: Element, stage: Element): Layer[] {
  const layers: Layer[] = [];
  for (const el of root.querySelectorAll<HTMLElement>('*')) {
    if (el === stage || stage.contains(el)) continue;
    const position = getComputedStyle(el).position;
    if (position !== 'absolute' && position !== 'fixed') continue;
    if (layers.some((layer) => layer.root.contains(el))) continue;
    const leaves = [el, ...el.querySelectorAll<HTMLElement>('*')].filter(paints);
    if (leaves.length > 0) layers.push({ root: el, leaves });
  }
  return layers;
}

function coversOver(layers: readonly Layer[]): Box[] {
  const covers: Box[] = [];
  for (const layer of layers) {
    if (opacityOf(layer.root) <= VISIBLE_OPACITY) continue;
    const box = union(layer.leaves.map(boxOf));
    if (box) covers.push(box);
  }
  const cue = document.getElementById(PLAYER_SUBTITLE_ID);
  if (cue && opacityOf(cue) > VISIBLE_OPACITY) {
    const box = union([...cue.querySelectorAll<HTMLElement>('*')].filter(paints).map(boxOf));
    if (box) covers.push(box);
  }
  return covers;
}

function marginArgs(rect: HoleRect | null): [string, number][] {
  const [l, t, r, b] = rect
    ? [rect.x, rect.y, Math.max(0, 1 - (rect.x + rect.w)), Math.max(0, 1 - (rect.y + rect.h))]
    : [0, 0, 0, 0];
  return [
    ['video-margin-ratio-left', l],
    ['video-margin-ratio-top', t],
    ['video-margin-ratio-right', r],
    ['video-margin-ratio-bottom', b],
  ];
}

function push(invoke: Invoke, shape: HoleShape | null): void {
  invoke('video_hole_set', { rect: shape?.rect ?? null, covers: shape?.covers ?? [] }).catch(
    () => undefined,
  );
  for (const [prop, value] of marginArgs(shape?.rect ?? null)) {
    invoke('mpv_command', { args: ['set_property', prop, value] }).catch(() => undefined);
  }
}

/** Whether the picture is drawn on a native plane BEHIND the page, which is what
 *  the Linux shell does and no other desktop OS needs. */
export function planeBehindPage(): boolean {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  return /Linux/i.test(ua) && !/Android/i.test(ua);
}

/**
 * Track the picture's box for as long as the player is on screen, cutting it out
 * of the window's shape and pointing mpv's plane at the same rect. The frame loop
 * runs only while the player is mounted, and only sends a shape that moved.
 */
export function installVideoHole(): void {
  const invoke = tauriInvoke();
  if (!invoke || !planeBehindPage()) return;

  let last: HoleShape | null = null;
  let layers: Layer[] = [];
  let frame: number | null = null;
  // A resize keeps the fractions but moves their pixels, so the shape has to be
  // re-cut even though nothing in the page moved.
  let dirty = true;

  const send = (shape: HoleShape | null) => {
    if (!dirty && !moved(shape, last)) return;
    dirty = false;
    last = shape;
    push(invoke, shape);
  };

  const tick = () => {
    const stage = document.getElementById(PLAYER_STAGE_ID);
    if (!stage) {
      frame = null;
      send(null);
      return;
    }
    send(holeShape(boxOf(stage), coversOver(layers), window.innerWidth, window.innerHeight));
    frame = requestAnimationFrame(tick);
  };

  const sync = () => {
    const root = document.getElementById(PLAYER_ROOT_ID);
    const stage = document.getElementById(PLAYER_STAGE_ID);
    layers = root && stage ? chromeLayers(root, stage) : [];
    if (stage && frame === null) frame = requestAnimationFrame(tick);
  };

  new MutationObserver(sync).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('resize', () => {
    dirty = true;
    sync();
  });
  sync();
}
