import { activeTheme, radiusValue, sharedStyle, styles, useStyleScope } from '#ui/core';
import { useStyles } from '#ui/core/styles';
// <Img>: the artwork surface, with a built-in fade-in and cross-fade on `src`
// change; `background` shows instantly as the fallback so the surface is never
// blank.

import { type ReactNode, useState } from 'react';
import { type StyleProp, View, type ViewStyle } from 'react-native';

import type { CornerValue } from '#ui/core/tokens';
import { useArtLayers } from '#ui/lib/art-layers';
import { gradient } from '#ui/lib/css';
import { safeImageUrl } from '#ui/lib/safe-image-url';
import { useCrossFade } from './use-cross-fade';

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
  /** Browser targets: keep the picture on a compositor layer of its own, so
   *  full-screen art is handed to the GPU instead of rasterized on the CPU. */
  layered?: boolean;
  /** The art covers its whole box with no transparency (a poster, a backdrop):
   *  `background` stops drawing once the art has faded in, and stays off while a
   *  cross-fade holds that art under the next one. */
  opaque?: boolean;
  onLoad?: () => void;
  onError?: () => void;
}

export const IMG_FADE_MS = 400;

const sDefinition = styles({ clip: { overflow: 'hidden' }, fill: { fill: true } });

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
  layered = false,
  opaque = false,
  onLoad,
  onError,
}: Readonly<ImgProps>) {
  const scope = useStyleScope();

  const s = useStyles(sDefinition);

  const src = safeImageUrl(requested);
  const { loaded, errored, under, markLoaded, markErrored } = useCrossFade(src, duration, {
    crossFade: !noCrossFade,
    watched: placeholder != null,
  });
  const [covered, setCovered] = useState<string | null>(null);
  const shownOver = src != null && !errored && covered != null && (covered === src || !noCrossFade);
  const onCovered = opaque && background !== undefined ? setCovered : undefined;
  const radius =
    corner === undefined ? undefined : radiusValue(corner, undefined, activeTheme(scope.theme));

  const handleError = () => {
    markErrored();
    onError?.();
  };

  const container = [
    fill ? s.fill : null,
    s.clip,
    radius === undefined ? null : sharedStyle(`img:radius:${radius}`, { radius }, scope),
    background === undefined || shownOver
      ? null
      : sharedStyle(`img:bg:${background}`, gradient(background), scope),
    style,
  ];

  const art = useArtLayers({
    src,
    under,
    alt,
    fit,
    position,
    radius,
    priority,
    duration,
    errored,
    layered,
    markLoaded,
    onCovered,
    onLoad,
    onError: handleError,
  });

  const showPlaceholder = placeholder != null && src != null && !loaded && !errored;
  const showFallback = fallback != null && (src == null || errored);
  const placeholderLayer = showPlaceholder ? (
    <View key="placeholder" style={s.fill}>
      {placeholder}
    </View>
  ) : null;
  const fallbackLayer = showFallback ? (
    <View key="fallback" style={s.fill}>
      {fallback}
    </View>
  ) : null;

  return art.surface(
    container,
    <>
      {placeholderLayer}
      {art.layers}
      {fallbackLayer}
    </>,
  );
}

export { Img };
