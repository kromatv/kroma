import { ease } from '#ui/lib/ease';
import type { FrostLayer } from './context';
import { createFrameLoop } from './loop';
import { coverMap, type GlRect, glRect } from './rect';
import { createFrostRenderer, type FrostArt, type FrostRenderer } from './renderer';
import { followScale, type ScaleFollow } from './scale.web';
import { glideDuration, type Tween, tweenAt } from './tween';

const MARK = 'data-kroma-frost';

interface Entry {
  surface: HTMLElement;
  top: boolean | null;
  radius: number;
  follow: ScaleFollow | null;
}

/** The art a frost layer draws, as loaded pictures, and how it sits. */
export interface FrostPicture extends FrostArt {
  at: { x: number; y: number };
  amount: number;
}

/** A frost layer bound to one canvas: what the surfaces use, plus its owner's controls. */
export interface FrostEngine extends FrostLayer {
  show(picture: FrostPicture | null): void;
  dispose(): void;
}

const nodeOf = (scroller: unknown): HTMLElement | null => {
  const s = scroller as { getScrollableNode?: () => unknown } | null;
  const node = s?.getScrollableNode?.() ?? s;
  return node instanceof HTMLElement ? node : null;
};

/** Draws a screen's backdrop into `canvas` and the frost of every registered
 *  surface over it, in the same frame those surfaces move. `onReady` hears
 *  whether the canvas now carries the backdrop. */
export function createFrostEngine(
  canvas: HTMLCanvasElement,
  root: HTMLElement,
  onReady: (ready: boolean) => void,
): FrostEngine {
  const entries = new Map<HTMLElement, Entry>();
  const glides = new Map<HTMLElement, { tween: Tween; horizontal: boolean }>();
  let renderer: FrostRenderer | null = null;
  let picture: FrostPicture | null = null;
  let fitFor = '';
  let ready = false;

  const start = () => {
    const gl = canvas.getContext('webgl', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
    });
    try {
      renderer = gl ? createFrostRenderer(gl) : null;
    } catch {
      renderer = null;
    }
    fitFor = '';
    if (renderer && picture) renderer.setArt(picture);
  };

  const setReady = (next: boolean) => {
    if (next === ready) return;
    ready = next;
    onReady(next);
  };

  const resolve = (entry: Entry) => {
    if (entry.top !== null) return;
    entry.top = !entry.surface.parentElement?.closest(`[${MARK}]`);
    if (!entry.top) return;
    entry.radius = Number.parseFloat(getComputedStyle(entry.surface).borderTopLeftRadius) || 0;
    entry.follow = followScale(entry.surface);
  };

  const draw = () => {
    if (!renderer || !picture) return;
    const frame = canvas.getBoundingClientRect();
    const dpr = globalThis.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(frame.width * dpr));
    const h = Math.max(1, Math.round(frame.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const fit = `${w}x${h}`;
    if (fit !== fitFor) {
      fitFor = fit;
      renderer.setFit({
        cover: coverMap(
          { width: w, height: h },
          { width: picture.art.naturalWidth, height: picture.art.naturalHeight },
          picture.at,
        ),
        blur: (picture.amount * w) / (canvas.offsetWidth || w),
      });
    }
    const rects: GlRect[] = [];
    for (const entry of entries.values()) {
      if (!entry.top) continue;
      const r = glRect(
        entry.surface.getBoundingClientRect(),
        frame,
        { width: w, height: h },
        entry.radius,
        entry.surface.offsetWidth,
      );
      if (r) rects.push(r);
    }
    renderer.draw(rects);
    setReady(true);
  };

  const tick = (now: number) => {
    let moving = false;
    for (const [node, g] of glides) {
      const { value, done } = tweenAt(g.tween, now, ease.out.native);
      if (g.horizontal) node.scrollLeft = value;
      else node.scrollTop = value;
      if (done) glides.delete(node);
      else moving = true;
    }
    for (const entry of entries.values()) {
      resolve(entry);
      if (entry.follow?.step(now)) moving = true;
    }
    draw();
    return moving;
  };

  const loop = createFrameLoop(
    tick,
    (run) => requestAnimationFrame(run),
    (handle) => cancelAnimationFrame(handle),
  );

  const sizes = new ResizeObserver(() => {
    for (const entry of entries.values()) {
      if (entry.top) {
        entry.radius = Number.parseFloat(getComputedStyle(entry.surface).borderTopLeftRadius) || 0;
      }
    }
    loop.request();
  });
  sizes.observe(canvas);

  const changes = new MutationObserver((records) => {
    const now = performance.now();
    for (const record of records) {
      if (record.type !== 'attributes') continue;
      const entry = [...entries.values()].find((e) => e.surface === record.target);
      const follow = entry?.follow;
      if (follow && (record.attributeName === 'class' || !follow.ownWrite())) follow.retarget(now);
    }
    loop.request();
  });
  changes.observe(root, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['class', 'style'],
  });

  const onScroll = () => loop.request();
  root.addEventListener('scroll', onScroll, true);
  const onLost = (event: Event) => {
    event.preventDefault();
    renderer = null;
    setReady(false);
  };
  const onRestored = () => {
    start();
    loop.request();
  };
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);
  start();

  return {
    register(mark) {
      const surface = mark.parentElement;
      if (!surface) return () => {};
      surface.setAttribute(MARK, '');
      const entry: Entry = { surface, top: null, radius: 0, follow: null };
      entries.set(mark, entry);
      sizes.observe(surface);
      loop.request();
      return () => {
        entry.follow?.release();
        surface.removeAttribute(MARK);
        sizes.unobserve(surface);
        entries.delete(mark);
        loop.request();
      };
    },
    glide(scroller, horizontal, offset) {
      const node = nodeOf(scroller);
      if (!node || !renderer || !ready) return false;
      const from = horizontal ? node.scrollLeft : node.scrollTop;
      const tween = {
        from,
        to: offset,
        start: performance.now(),
        duration: glideDuration(offset - from),
      };
      glides.set(node, { tween, horizontal });
      loop.request();
      return true;
    },
    show(next) {
      picture = next;
      fitFor = '';
      if (next && renderer) renderer.setArt(next);
      if (!next) setReady(false);
      loop.request();
    },
    dispose() {
      loop.stop();
      sizes.disconnect();
      changes.disconnect();
      root.removeEventListener('scroll', onScroll, true);
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      for (const entry of entries.values()) entry.follow?.release();
      renderer?.dispose();
      renderer = null;
    },
  };
}
