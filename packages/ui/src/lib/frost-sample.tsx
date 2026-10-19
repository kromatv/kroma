import { type CSSProperties, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { coverRect, parsePosition } from './cover-rect';
import { webDocument } from './dom';
import type { FrostSourceValue } from './frost-source';
import { paintRamps, parseRamps } from './ramp-paint';

const FRAME_W = 1920;
const ASPECT = 9 / 16;
const SAMPLE_W = 320;

const samples = new Map<string, Promise<string | null>>();

function paint(doc: Document, art: HTMLImageElement, source: FrostSourceValue, amount: number) {
  const width = SAMPLE_W;
  const scale = width / FRAME_W;
  const bleed = Math.ceil(amount * scale * 2);
  const height = Math.round(width * ASPECT);
  const canvas = doc.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d');
  if (!g) return null;
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  const rect = coverRect(
    { width, height },
    { width: art.naturalWidth, height: art.naturalHeight },
    parsePosition(source.position),
  );
  if (!rect) return null;
  g.filter = `blur(${amount * scale}px)`;
  g.drawImage(
    art,
    rect.left - bleed,
    rect.top - bleed,
    rect.width + bleed * 2,
    rect.height + bleed * 2,
  );
  g.filter = 'none';
  const ramps = source.veil ? parseRamps(source.veil) : null;
  if (ramps) paintRamps(g, ramps, width, height);
  return canvas.toDataURL('image/png');
}

function sample(source: FrostSourceValue, amount: number): Promise<string | null> {
  const key = `${source.src}|${source.position}|${source.veil ?? ''}|${amount}`;
  const known = samples.get(key);
  if (known) return known;
  const doc = webDocument();
  const made = new Promise<string | null>((done) => {
    if (!doc) {
      done(null);
      return;
    }
    const art = doc.createElement('img');
    art.crossOrigin = 'anonymous';
    art.onload = () => {
      try {
        done(paint(doc, art, source, amount));
      } catch {
        done(null);
      }
    };
    art.onerror = () => done(null);
    art.src = source.src;
  });
  samples.set(key, made);
  return made;
}

function useSample(source: FrostSourceValue, amount: number): string | null {
  const [drawn, setDrawn] = useState<{ for: FrostSourceValue; url: string | null } | null>(null);
  useEffect(() => {
    let live = true;
    void sample(source, amount).then((url) => {
      if (live) setDrawn({ for: source, url });
    });
    return () => {
      live = false;
    };
  }, [source, amount]);
  return drawn?.for === source ? drawn.url : null;
}

const ART: CSSProperties = { position: 'absolute', left: 0, top: 0, pointerEvents: 'none' };

const WASH: CSSProperties = {
  position: 'absolute',
  left: 0,
  top: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'inherit',
};

const CLIP: CSSProperties = {
  position: 'absolute',
  left: 0,
  top: 0,
  right: 0,
  bottom: 0,
  zIndex: -1,
  overflow: 'hidden',
  borderRadius: 'inherit',
  backgroundColor: 'inherit',
  pointerEvents: 'none',
};

const asElement = (node: unknown): HTMLElement | null =>
  node && typeof (node as HTMLElement).getBoundingClientRect === 'function'
    ? (node as HTMLElement)
    : null;

function useLineUp(source: FrostSourceValue, url: string | null) {
  const clip = useRef<HTMLDivElement>(null);
  const art = useRef<HTMLImageElement>(null);
  useLayoutEffect(() => {
    if (!url) return undefined;
    return source.tracker.watch(() => {
      const frame = asElement(source.frame.current);
      const box = clip.current;
      const img = art.current;
      if (!(frame && box && img)) return null;
      const f = frame.getBoundingClientRect();
      const b = box.getBoundingClientRect();
      const k = b.width > 0 ? box.offsetWidth / b.width : 1;
      return () => {
        img.style.left = `${(f.left - b.left) * k}px`;
        img.style.top = `${(f.top - b.top) * k}px`;
        img.style.width = `${f.width * k}px`;
        img.style.height = `${f.height * k}px`;
      };
    });
  }, [source, url]);
  return { clip, art };
}

/** The screen's artwork, shrunk and stretched back over the frame of its
 *  `<FrostSource>`, showing through the surface it is drawn in. The surface's
 *  own fill is repeated above it as the wash. */
export function FrostSample({
  source,
  amount,
}: Readonly<{ source: FrostSourceValue; amount: number }>) {
  const url = useSample(source, amount);
  const { clip, art } = useLineUp(source, url);
  if (!url) return null;
  return (
    <div ref={clip} style={CLIP} aria-hidden>
      <img ref={art} src={url} alt="" draggable={false} style={ART} />
      <div style={WASH} />
    </div>
  );
}
