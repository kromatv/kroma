// <Img>: the artwork surface, with a built-in fade-in and cross-fade on `src`
// change; `background` shows instantly as the fallback so the surface is never
// blank.
//
// One file for both platforms: the leaf element differs (a real `<img>` on
// web for `loading`/`fetchpriority`/`object-position`; the registered image
// backend natively) but everything above it — container, placeholder,
// cross-fade timing, cover maths — is shared.

import { safeImageUrl } from '@kroma/core';
import {
  type CSSProperties,
  Fragment,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  type LayoutChangeEvent,
  Platform,
  type StyleProp,
  View,
  type ViewStyle,
} from 'react-native';
import { absoluteFill } from '#ui/core/tokens';
import { coverRect, parsePosition } from '#ui/lib/cover-rect';
import { gradient } from '#ui/lib/css';
import { imageBackend } from '#ui/lib/image-backend';

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
  /** Corner radius; the container clips the art to it. */
  radius?: number;
  /** Stretch to fill a positioned parent (absolute, inset 0). */
  fill?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Mark this the above-the-fold LCP art: load it eagerly at high priority
   *  instead of lazily. Web only, and at most one image per screen. */
  priority?: boolean;
  /**
   * Skip holding the previous image underneath while the next one loads; just
   * fade the new one in over the background. Off by default — a full-screen
   * backdrop that swaps on every focus settle would otherwise recomposite two
   * full-size layers for the length of the fade.
   */
  noCrossFade?: boolean;
  onLoad?: () => void;
  onError?: () => void;
}

export const IMG_FADE_MS = 400;

interface CrossFade {
  loaded: boolean;
  errored: boolean;
  under: string | null;
  markLoaded: () => void;
  markErrored: () => void;
}

function useCrossFade(src: string | null, duration: number): CrossFade {
  const [shown, setShown] = useState<string | null>(src);
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const [under, setUnder] = useState<string | null>(null);
  const loadedSrc = useRef<string | null>(null);

  // Adjusted during render, not in an effect: a post-commit update would paint
  // one frame of the new (transparent) image over nothing, which reads as a
  // flicker.
  if (shown !== src) {
    const prev = loadedSrc.current;
    setUnder(src && prev && prev !== src ? prev : null);
    setShown(src);
    setLoaded(false);
    setErrored(false);
  }

  // Drop the underlay once the incoming image has finished fading in over it.
  useEffect(() => {
    if (!loaded || under == null) return;
    const id = setTimeout(() => setUnder(null), duration);
    return () => clearTimeout(id);
  }, [loaded, under, duration]);

  return {
    loaded,
    errored,
    under,
    markLoaded: () => {
      loadedSrc.current = src;
      setLoaded(true);
    },
    markErrored: () => {
      setErrored(true);
      setUnder(null);
    },
  };
}

interface Size {
  width: number;
  height: number;
}

const IS_WEB = Platform.OS === 'web';

function Img({
  src: requested,
  alt = '',
  duration = IMG_FADE_MS,
  fit = 'cover',
  position = '50% 50%',
  background,
  radius,
  fill = false,
  style,
  priority = false,
  noCrossFade = false,
  onLoad,
  onError,
}: Readonly<ImgProps>) {
  // Sanitised once here, rather than at each leaf below, so it also covers
  // `under` (an earlier `src`) ahead of the cross-fade.
  const src = safeImageUrl(requested);
  const cross = useCrossFade(src, duration);
  const { loaded, errored, markLoaded, markErrored } = cross;
  const under = noCrossFade ? null : cross.under;
  const [box, setBox] = useState<Size | null>(null);
  const [natural, setNatural] = useState<Size | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const focal = useMemo(() => parsePosition(position), [position]);

  // React Native has no object-position, so the native leaf places the cover
  // rectangle itself; `contain` never overflows, so it needs no focal maths.
  const rect = !IS_WEB && fit === 'cover' ? coverRect(box, natural, focal) : null;

  const onBoxLayout = (e: LayoutChangeEvent) => {
    if (IS_WEB) return;
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

  if (IS_WEB) {
    return (
      <View style={container}>
        {webLayers({
          src,
          under,
          alt,
          fit,
          position,
          radius,
          priority,
          duration,
          loaded,
          errored,
          markLoaded,
          onLoad,
          onError: handleError,
        })}
      </View>
    );
  }

  const layer = rect ? { position: 'absolute' as const, ...rect } : absoluteFill;
  const mode = rect ? ('stretch' as const) : fit;
  const backend = imageBackend();
  // A backend that fades itself (expo-image) is left alone; one that doesn't
  // (React Native's <Image>) is cross-faded here instead.
  const leaf = (uri: string, animated: boolean) =>
    backend.render({
      uri,
      fit: mode,
      fadeMs: duration,
      accessibilityLabel: alt || undefined,
      onLoad: (size: { width: number; height: number } | null) => {
        if (size) setNatural(size);
        markLoaded();
        if (!backend.fades) {
          Animated.timing(opacity, { toValue: 1, duration, useNativeDriver: true }).start();
        }
        onLoad?.();
      },
      onError: handleError,
      style: [layer, animated && !backend.fades ? { opacity: loaded ? opacity : 0 } : null],
    });

  return (
    <View onLayout={onBoxLayout} style={container}>
      {under && under !== src ? (
        <View key="under" style={layer}>
          {backend.render({ uri: under, fit: mode, fadeMs: 0, style: absoluteFill })}
        </View>
      ) : null}
      {src && !errored ? <Fragment key={src}>{leaf(src, true)}</Fragment> : null}
    </View>
  );
}

interface WebLayersArgs {
  src: string | null;
  under: string | null;
  alt: string;
  fit: 'cover' | 'contain';
  position: string;
  radius: number | undefined;
  priority: boolean;
  duration: number;
  loaded: boolean;
  errored: boolean;
  markLoaded: () => void;
  onLoad: (() => void) | undefined;
  onError: () => void;
}

// A plain function, not a component: it returns the same elements <Img> used
// to return inline, so the tree, keys and style identities are unchanged.
function webLayers(at: Readonly<WebLayersArgs>): ReactNode {
  // Four longhands, not the `inset` shorthand, which old webOS Chromium 53
  // does not know and would drop from an inline style.
  const layer: CSSProperties = {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    width: '100%',
    height: '100%',
    objectFit: at.fit,
    objectPosition: at.position,
    // Chrome doesn't reliably clip a border-radius on a composited descendant,
    // and an <img> is exactly that — so the image rounds itself too.
    borderRadius: at.radius,
  };
  return (
    <>
      {at.under && at.under !== at.src ? (
        <img key="under" src={at.under} alt="" aria-hidden draggable={false} style={layer} />
      ) : null}
      {at.src && !at.errored ? (
        <img
          key={at.src}
          src={at.src}
          alt={at.alt}
          // Cached art can already be `complete` before React attaches onLoad,
          // so the event never fires: check the element the moment it mounts.
          ref={(el) => {
            if (el?.complete && el.naturalWidth > 0) at.markLoaded();
          }}
          loading={at.priority ? 'eager' : 'lazy'}
          fetchPriority={at.priority ? 'high' : undefined}
          decoding="async"
          draggable={false}
          onLoad={() => {
            at.markLoaded();
            at.onLoad?.();
          }}
          onError={at.onError}
          style={{
            ...layer,
            opacity: at.loaded ? 1 : 0,
            transition: `opacity ${at.duration}ms ease`,
          }}
        />
      ) : null}
    </>
  );
}

export { Img };
