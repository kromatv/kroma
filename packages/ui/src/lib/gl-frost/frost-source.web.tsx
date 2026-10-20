import { type CSSProperties, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useKitSettings } from '#ui/lib/kit-settings';
import { FrostLayerContext } from './context';
import { createFrostEngine, type FrostEngine } from './engine.web';
import type { FrostSourceProps } from './frost-source-types';
import { loadPicture } from './picture.web';

const FILL: CSSProperties = {
  position: 'absolute',
  left: 0,
  top: 0,
  width: '100%',
  height: '100%',
  pointerEvents: 'none',
};
const HIDDEN: CSSProperties = { ...FILL, visibility: 'hidden' };
const GONE: CSSProperties = { ...FILL, display: 'none' };

/**
 * The frame a screen's full-bleed art fills. Its art, veil and the frost of
 * every `<Frost>` inside it are drawn on one WebGL canvas under the screen,
 * the blur computed once per art, so a frosted surface and the backdrop it
 * shows move in the same frame. Without WebGL, `backdrop` stays and the
 * surfaces keep their plain fill.
 */
export function FrostSource({
  src,
  position = '50% 50%',
  veil,
  amount = 12,
  backdrop,
  style,
  children,
}: Readonly<FrostSourceProps>) {
  const frame = useRef<View>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [engine, setEngine] = useState<FrostEngine | null>(null);
  const [ready, setReady] = useState(false);
  const { frostHost } = useKitSettings();

  useEffect(() => {
    const root = frame.current as unknown as HTMLElement | null;
    const surface = canvas.current;
    if (!(root && surface)) return undefined;
    const made = createFrostEngine(surface, root, setReady);
    setEngine(made);
    return () => {
      made.dispose();
      setEngine(null);
    };
  }, []);

  useEffect(() => {
    if (!engine) return undefined;
    let live = true;
    if (src) {
      void loadPicture(src, veil, position, amount).then((picture) => {
        if (live) engine.show(picture);
      });
    } else engine.show(null);
    return () => {
      live = false;
    };
  }, [engine, src, veil, position, amount]);

  useEffect(
    () => (engine && ready && frostHost ? frostHost.offer(engine) : undefined),
    [engine, ready, frostHost],
  );

  return (
    <FrostLayerContext.Provider value={engine}>
      <View ref={frame} style={style}>
        <div style={ready ? GONE : FILL}>{backdrop}</div>
        <canvas ref={canvas} style={ready ? FILL : HIDDEN} />
        {children}
      </View>
    </FrostLayerContext.Provider>
  );
}
