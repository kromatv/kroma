// <Img>: the artwork surface, with a built-in fade-in and cross-fade on `src`
// change; `background` shows instantly as the fallback so the surface is never
// blank.

import { safeImageUrl } from '@kroma/core';
import { type ReactNode, useLayoutEffect, useState } from 'react';
import {
  Animated,
  type LayoutChangeEvent,
  type StyleProp,
  View,
  type ViewStyle,
} from 'react-native';
import { radiusValue } from '#ui/core';
import { absoluteFill, type CornerValue } from '#ui/core/tokens';
import { coverRect, parsePosition } from '#ui/lib/cover-rect';
import { gradient } from '#ui/lib/css';
import { WEB } from '#ui/lib/platform';
import { nativeLayers, type Size } from './native-layers';
import { useCrossFade } from './use-cross-fade';
import { webLayers } from './web-layers';

export interface ImgProps {
  /** Already-sized artwork URL. This component never rewrites it. */
  src: string | null;
  /** Accessibility text. Empty (the default) marks the artwork decorative. */
  alt?: string;
  /** Applies to both the load-in fade and the cross-fade on `src` change. */
  duration?: number;
  /** Defaults to `cover`. */
  fit?: 'cover' | 'contain';
  /** CSS object-position, e.g. `'50% 28%'` (heroes favour the upper third).
   *  Only has a visible effect when `fit` is `cover` AND the art's aspect ratio
   *  differs from the box's, which is why rail tiles leave it at the default. */
  position?: string;
  /** CSS background painted behind the art: the instant-visible fallback fill
   *  shown while loading and on error. */
  background?: string;
  /** Corner, by token name or in px; the container clips the art to it. */
  radius?: CornerValue;
  /** Stretch to fill a positioned parent (absolute, inset 0). */
  fill?: boolean;
  /** Drawn under the art while it loads (a blur hash, a glyph). */
  placeholder?: ReactNode;
  /** Drawn when there is no `src` or it failed (initials, a fallback glyph),
   *  so the surface degrades to something said rather than to blank. */
  fallback?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Mark this the above-the-fold LCP art: load it eagerly at high priority
   *  instead of lazily. Web only, and at most one image per screen. */
  priority?: boolean;
  /**
   * Skip holding the previous image underneath while the next one loads; just
   * fade the new one in over the background. Off by default: a full-screen
   * backdrop that swaps on every focus settle would otherwise recomposite two
   * full-size layers for the length of the fade.
   */
  noCrossFade?: boolean;
  onLoad?: () => void;
  onError?: () => void;
}

export const IMG_FADE_MS = 400;

function Img({
  src: requested,
  alt = '',
  duration = IMG_FADE_MS,
  fit = 'cover',
  position = '50% 50%',
  background,
  radius: corner,
  fill = false,
  placeholder,
  fallback,
  style,
  priority = false,
  noCrossFade = false,
  onLoad,
  onError,
}: Readonly<ImgProps>) {
  const src = safeImageUrl(requested);
  const cross = useCrossFade(src, duration);
  const { loaded, errored, markLoaded, markErrored } = cross;
  const under = noCrossFade ? null : cross.under;
  const [box, setBox] = useState<Size | null>(null);
  const [natural, setNatural] = useState<Size | null>(null);
  const [opacity] = useState(() => new Animated.Value(0));
  const focal = parsePosition(position);
  const radius = corner === undefined ? undefined : radiusValue(corner);

  // Before paint, not after it: the leaf remounts with this source's key in
  // the same commit, and one frame of the previous cover at full opacity is
  // exactly the cut the fade exists to avoid.
  useLayoutEffect(() => {
    if (!WEB && src) opacity.setValue(0);
  }, [src, opacity]);

  // React Native has no object-position, so the native leaf places the cover
  // rectangle itself; `contain` never overflows, so it needs no focal maths.
  const rect = !WEB && fit === 'cover' ? coverRect(box, natural, focal) : null;

  const onBoxLayout = (e: LayoutChangeEvent) => {
    if (WEB) return;
    const { width, height } = e.nativeEvent.layout;
    setBox((prev) => (prev?.width === width && prev.height === height ? prev : { width, height }));
  };

  const handleError = () => {
    markErrored();
    onError?.();
  };

  const container = [
    fill ? absoluteFill : null,
    { overflow: 'hidden' as const },
    radius === undefined ? null : { borderRadius: radius },
    background === undefined ? null : gradient(background),
    style,
  ];

  const showPlaceholder = placeholder != null && src != null && !loaded && !errored;
  const showFallback = fallback != null && (src == null || errored);
  const placeholderLayer = showPlaceholder ? (
    <View key="placeholder" style={absoluteFill}>
      {placeholder}
    </View>
  ) : null;
  const fallbackLayer = showFallback ? (
    <View key="fallback" style={absoluteFill}>
      {fallback}
    </View>
  ) : null;

  if (WEB) {
    return (
      <View style={container}>
        {placeholderLayer}
        {webLayers({
          src,
          under,
          alt,
          fit,
          position,
          radius,
          priority,
          duration,
          errored,
          markLoaded,
          onLoad,
          onError: handleError,
        })}
        {fallbackLayer}
      </View>
    );
  }

  return (
    <View onLayout={onBoxLayout} style={container}>
      {placeholderLayer}
      {nativeLayers({
        src,
        under,
        alt,
        fit,
        rect,
        duration,
        errored,
        opacity,
        setNatural,
        markLoaded,
        onLoad,
        onError: handleError,
      })}
      {fallbackLayer}
    </View>
  );
}

export { Img };
