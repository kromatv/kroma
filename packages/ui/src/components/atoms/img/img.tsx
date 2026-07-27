// <Img>: the artwork surface, with a built-in fade.
//
// - Fade-in on load: art starts transparent and eases to full opacity once
//   decoded, so a tile or a hero never pops in.
// - Cross-fade on `src` change: the previously loaded image is held underneath
//   while the new one loads, then the new one fades in over it. That is what
//   makes the browse screens' ambient backdrop swap cleanly.
// - `background` (usually a deterministic genre gradient) shows instantly and
//   stays as the fallback, so the surface is never blank.
//
// ONE file for both worlds. The leaf element is the only thing that differs and
// it differs for a real reason: on the web a true <img> keeps `loading="lazy"`,
// `fetchpriority` and `object-position`, which a 1000-poster grid on a TV needs
// and which react-native-web's Image (a div with a background-image) cannot
// give; natively, the leaf is drawn by the registered image backend (see
// lib/image-backend), which is React Native's own <Image> unless an app swaps in
// something better for its platform. Everything above the leaf (the container,
// the placeholder, the cross-fade timing, the cover maths) is shared, which is
// what keeps every target pixel-identical.

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
import { coverRect, parsePosition } from '#ui/lib/cover-rect';
import { gradient } from '#ui/lib/css';
import { imageBackend } from '#ui/lib/image-backend';
import { absoluteFill } from '#ui/lib/tokens';

/* ------------------------------------------------------------------ props -- */

export interface ImgProps {
  /** Already-sized artwork URL. This component never rewrites it. */
  src: string | null;
  /** Accessibility text. Empty (the default) marks the artwork decorative. */
  alt?: string;
  /** Fade duration in ms, for both the load-in and the cross-fade on `src` change. */
  duration?: number;
  /** How the art fills its box. Default `cover`. */
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
   * Never hold the previous image underneath while the next one loads; just fade
   * the new one in over the background. The cross-fade paints TWO full-size
   * layers at once, which for a small tile is nothing and for a FULL-SCREEN
   * decorative backdrop is the browse grid's worst frame - it swaps on every
   * focus settle, and a television recomposites two 1080p layers for the length
   * of the fade. Off (cross-fading) by default, because for foreground artwork
   * the double layer is exactly the point.
   */
  noCrossFade?: boolean;
  onLoad?: () => void;
  onError?: () => void;
}

/** Fade default. */
export const IMG_FADE_MS = 400;

/* ------------------------------------------------------ cross-fade state --- */

interface CrossFade {
  /** The current `src` has decoded and can be revealed. */
  loaded: boolean;
  /** The current `src` failed; show the background instead. */
  errored: boolean;
  /** The previous, still fully loaded image held underneath while the incoming
   *  one decodes. Null once the fade has finished, or when there is nothing to
   *  fade from (first load, or clearing to no art). */
  under: string | null;
  markLoaded: () => void;
  markErrored: () => void;
}

/**
 * The load-in / cross-fade state machine.
 *
 * Platform-neutral on purpose: it holds no element ref and touches no DOM, so
 * the two leaf renderers below differ only in HOW they display a layer, never in
 * WHEN. That is what keeps a hero swap looking identical on Apple TV and Tizen.
 */
function useCrossFade(src: string | null, duration: number): CrossFade {
  const [shown, setShown] = useState<string | null>(src);
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const [under, setUnder] = useState<string | null>(null);
  const loadedSrc = useRef<string | null>(null);

  // Adjusted during render rather than in an effect: a post-commit update would
  // paint one frame of the new (transparent) image over nothing, which reads as
  // a flicker. Promote the last fully-loaded image to the underlay and start the
  // incoming one at opacity 0. Clearing to null (or to the same url) drops the
  // underlay, so we never cross-fade from stale art.
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

/* ---------------------------------------------------------- the component -- */

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
  // Checked HERE, once, rather than at each of the leaves below: artwork URLs
  // come from whichever server the client is signed into, and `under` is just an
  // earlier `src`, so sanitising ahead of the cross-fade covers both layers.
  const src = safeImageUrl(requested);
  const cross = useCrossFade(src, duration);
  const { loaded, errored, markLoaded, markErrored } = cross;
  // Dropping the underlay is the whole of "no cross-fade": the new image still
  // fades in, there is just never a second layer held beneath it.
  const under = noCrossFade ? null : cross.under;
  const [box, setBox] = useState<Size | null>(null);
  const [natural, setNatural] = useState<Size | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const focal = useMemo(() => parsePosition(position), [position]);

  // The browser has object-position; React Native does not, so the native leaf
  // measures the box and the artwork and places the cover rectangle itself.
  // `contain` never overflows, so it needs no focal maths at all.
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

  // With a known cover rectangle the geometry is already exact, so the image is
  // stretched into it; before that we fall back to a plain centred cover.
  const layer = rect ? { position: 'absolute' as const, ...rect } : absoluteFill;
  const mode = rect ? ('stretch' as const) : fit;
  const backend = imageBackend();
  // A backend that fades itself (expo-image) is left alone; one that does not
  // (React Native's <Image>) is cross-faded here, so the timing is the design's
  // either way.
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

/** Every argument the web leaf needs. One object, because the alternative is a
 * dozen positional parameters. */
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

/**
 * The web leaves: the outgoing image held underneath, and the incoming one
 * fading in over it.
 *
 * A plain function rather than a component, deliberately. It returns the same
 * two elements <Img> used to return inline, so the tree, the keys and the style
 * identities are unchanged - a component here would add a layer to the most
 * instantiated primitive in the kit for nothing.
 */
function webLayers(at: Readonly<WebLayersArgs>): ReactNode {
  // Fill with the four longhands, not the `inset` shorthand, which old webOS
  // Chromium 53 does not know and would drop from an inline style.
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
    // The image rounds ITSELF, rather than trusting the container to clip it.
    // Chrome does not reliably apply an `overflow: hidden` + `border-radius`
    // clip to a COMPOSITED descendant, and an <img> is exactly that - so a
    // rounded card drew square artwork into all four corners, and looked like a
    // hard-edged rectangle with a scrim painted across it. The container still
    // clips; this just stops the result depending on whether it does.
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
