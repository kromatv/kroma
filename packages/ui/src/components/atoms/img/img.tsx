// <Img>: the artwork surface, with a built-in fade-in and cross-fade on `src`
// change; `background` shows instantly as the fallback so the surface is never
// blank.
//
// One file for both platforms: the leaf element differs (a real `<img>` on
// web for `loading`/`fetchpriority`/`object-position`; the registered image
// backend natively) but everything above it (container, placeholder,
// cross-fade timing, cover maths) is shared.

import { safeImageUrl } from '@kroma/core';
import {
  type CSSProperties,
  Fragment,
  type ReactNode,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
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
import { imageBackend } from '#ui/lib/image-backend';
import { WEB } from '#ui/lib/platform';

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
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const settling = useRef<{
    frame: number;
    timer: ReturnType<typeof setTimeout>;
    src: string | null;
  } | null>(null);
  // What the last commit actually put on screen, so a frame armed for one
  // source can tell that another has taken its place before it ran.
  const committed = useRef(src);
  useLayoutEffect(() => {
    committed.current = src;
  }, [src]);
  useEffect(
    () => () => {
      if (!settling.current) return;
      cancelAnimationFrame(settling.current.frame);
      clearTimeout(settling.current.timer);
    },
    [],
  );

  // Adjusted during render, not in an effect: a post-commit update would paint
  // one frame of the new (transparent) image over nothing, which reads as a
  // flicker.
  if (shown !== src) {
    setUnder(src && loadedSrc && loadedSrc !== src ? loadedSrc : null);
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

  const markLoaded = useEffectEvent(() => {
    // Idempotent per source: React re-invokes the inline `ref` below on every
    // render, so a decoded image reports itself again on each one.
    if (settling.current?.src === src || (loaded && loadedSrc === src)) return;
    setLoadedSrc(src);
    // On the web the reveal is a CSS transition, and a transition only runs
    // when the browser has PAINTED the state it starts from. Artwork already
    // in the cache is `complete` the moment its ref runs, so this lands in
    // the same commit: opacity would step 0 -> 1 with the transparent state
    // never on screen, and the image cuts instead of fading. Waiting a single
    // frame is all the first paint needs - and the splash pre-decodes its
    // next cover on purpose, so every handover there took this path.
    if (!WEB) {
      setLoaded(true);
      return;
    }
    if (settling.current) {
      cancelAnimationFrame(settling.current.frame);
      clearTimeout(settling.current.timer);
    }
    const settle = () => {
      settling.current = null;
      // The source can move on while this waits - rAF is suspended in a hidden
      // tab, and a legacy webOS frame is 100ms+ - and a reveal armed for one
      // image must never show another.
      if (committed.current === src) setLoaded(true);
    };
    const frame = requestAnimationFrame(settle);
    // A frame is not a promise. It does not run while the tab is hidden, and a
    // television busy decoding video can skip it for a long time - and until
    // it runs the image sits at opacity 0 with its bytes already in hand,
    // which is what "the artwork never loads" actually looked like. The timer
    // is the floor under that: late is a cut instead of a fade, which is worth
    // far less than a picture that never appears.
    const timer = setTimeout(settle, REVEAL_FLOOR_MS);
    settling.current = { frame, timer, src };
  });

  const markErrored = useEffectEvent(() => {
    setErrored(true);
    setUnder(null);
  });

  return { loaded, errored, under, markLoaded, markErrored };
}

interface Size {
  width: number;
  height: number;
}

/** How long the reveal waits for a frame before showing the image anyway. */
const REVEAL_FLOOR_MS = 250;

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
  // Sanitised once here, rather than at each leaf below, so it also covers
  // `under` (an earlier `src`) ahead of the cross-fade.
  const src = safeImageUrl(requested);
  const cross = useCrossFade(src, duration);
  const { loaded, errored, markLoaded, markErrored } = cross;
  const under = noCrossFade ? null : cross.under;
  const [box, setBox] = useState<Size | null>(null);
  const [natural, setNatural] = useState<Size | null>(null);
  const [opacity] = useState(() => new Animated.Value(0));
  const focal = parsePosition(position);
  const radius = corner === undefined ? undefined : radiusValue(corner);

  // Each new source starts transparent again. Before paint, not in an effect
  // after it: the leaf remounts with this source's key in the same commit, and
  // a frame of the previous cover at full opacity under the new one is exactly
  // the cut the fade exists to avoid.
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

  // The extra surfaces both platforms share: the placeholder sits under the
  // incoming art and leaves with it; the fallback replaces it outright.
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
          loaded,
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

interface NativeLayersArgs {
  src: string | null;
  under: string | null;
  alt: string;
  fit: 'cover' | 'contain';
  rect: { top: number; left: number; width: number; height: number } | null;
  duration: number;
  errored: boolean;
  opacity: Animated.Value;
  setNatural: (size: Size) => void;
  markLoaded: () => void;
  onLoad: (() => void) | undefined;
  onError: () => void;
}

// The native counterpart of webLayers, and a plain function for the same
// reason: same elements, same keys, same style identities as when <Img>
// returned them inline.
function nativeLayers(at: Readonly<NativeLayersArgs>): ReactNode {
  const layer = at.rect ? { position: 'absolute' as const, ...at.rect } : absoluteFill;
  const mode = at.rect ? ('stretch' as const) : at.fit;
  const backend = imageBackend();
  // A backend that fades itself (expo-image) is left alone; one that doesn't
  // (React Native's <Image>) is cross-faded here instead.
  const leaf = (uri: string, animated: boolean) =>
    backend.render({
      uri,
      fit: mode,
      fadeMs: at.duration,
      accessibilityLabel: at.alt || undefined,
      onLoad: (size: Size | null) => {
        if (size) at.setNatural(size);
        at.markLoaded();
        if (!backend.fades) {
          Animated.timing(at.opacity, {
            toValue: 1,
            duration: at.duration,
            useNativeDriver: true,
          }).start();
        }
        at.onLoad?.();
      },
      onError: at.onError,
      // ALWAYS the driven value, never a bare number. Two reasons, and the
      // second is the one that bites on tvOS:
      //
      // - the value belongs to the <Img>, not to the source, so it is still
      //   sitting at 1 from the last fade when the next cover arrives; it is
      //   reset per source in the layout effect above rather than here.
      // - swapping between `{ opacity: 0 }` and `{ opacity: <value> }` changes
      //   the STYLE'S SHAPE between renders, and a native-driven animation
      //   attached to a prop that JS just rewrote does not run under Fabric.
      //   The image simply appeared, which is what "fading is broken on Apple
      //   TV" looks like.
      style: [layer, animated && !backend.fades ? { opacity: at.opacity } : null],
    });

  return (
    <>
      {at.under && at.under !== at.src ? (
        <View key="under" style={layer}>
          {backend.render({ uri: at.under, fit: mode, fadeMs: 0, style: absoluteFill })}
        </View>
      ) : null}
      {at.src && !at.errored ? <Fragment key={at.src}>{leaf(at.src, true)}</Fragment> : null}
    </>
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
    // and an <img> is exactly that, so the image rounds itself too.
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
          // The fade is an ANIMATION the browser owns, not an opacity this
          // component drives (`kroma-img-in`, in styles.css): an image whose
          // reveal depends on React state is an image that stays invisible
          // whenever that state does not arrive - a load event missed on cached
          // art, a frame that never runs on a busy television - with its bytes
          // already decoded. Its resting state is VISIBLE; the keyframes only
          // decide how it got there.
          style={{ ...layer, animation: `kroma-img-in ${at.duration}ms ease both` }}
        />
      ) : null}
    </>
  );
}

export { Img };
