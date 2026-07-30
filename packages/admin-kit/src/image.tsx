import { safeImageUrl } from '@kroma/core';
import {
  type CSSProperties,
  type ImgHTMLAttributes,
  type ReactNode,
  type RefObject,
  type SyntheticEvent,
  useEffect,
  useRef,
  useState,
} from 'react';

type ImgAttrs = ImgHTMLAttributes<HTMLImageElement>;

export interface ImageProps {
  src?: string | null;
  alt?: string;
  duration?: number;
  fit?: CSSProperties['objectFit'];
  position?: CSSProperties['objectPosition'];
  background?: string;
  placeholder?: ReactNode;
  fallback?: ReactNode;
  radius?: CSSProperties['borderRadius'];
  fill?: boolean;
  className?: string;
  style?: CSSProperties;
  loading?: NonNullable<ImgAttrs['loading']>;
  fetchPriority?: NonNullable<ImgAttrs['fetchPriority']>;
  decoding?: NonNullable<ImgAttrs['decoding']>;
  draggable?: boolean;
  sizes?: string;
  srcSet?: string;
  crossOrigin?: NonNullable<ImgAttrs['crossOrigin']>;
  referrerPolicy?: NonNullable<ImgAttrs['referrerPolicy']>;
  onLoad?: (e: SyntheticEvent<HTMLImageElement>) => void;
  onError?: (e: SyntheticEvent<HTMLImageElement>) => void;
}

// Fill the container with the four longhands, not the `inset` shorthand: old
// webOS Chromium 53 doesn't know it and would drop it from an inline style.
const FILL: CSSProperties = {
  position: 'absolute',
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  width: '100%',
  height: '100%',
};

interface CrossFade {
  loaded: boolean;
  errored: boolean;
  under: string | null;
  imgRef: RefObject<HTMLImageElement | null>;
  markLoaded: () => void;
  markErrored: () => void;
}

function useCrossFade(src: string | null, duration: number): CrossFade {
  const [shown, setShown] = useState<string | null>(src);
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const [under, setUnder] = useState<string | null>(null);
  const loadedSrcRef = useRef<string | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  // Adjusted during render, not in an effect, to avoid a one-frame flicker:
  // promotes the last loaded image to the underlay and starts the incoming
  // one at opacity 0. Clearing to null (or the same url) drops the underlay
  // so we never cross-fade from a stale image.
  if (shown !== src) {
    const prev = loadedSrcRef.current;
    setUnder(src && prev && prev !== src ? prev : null);
    setShown(src);
    setLoaded(false);
    setErrored(false);
  }

  // Cached images can already be `complete` before React attaches `onLoad`, so
  // the load event never fires mark them loaded on mount to reveal them.
  useEffect(() => {
    const el = imgRef.current;
    if (el?.complete && el.naturalWidth > 0) {
      loadedSrcRef.current = src;
      setLoaded(true);
    }
  }, [src]);

  // Drop the underlay once the incoming image has finished fading in over it.
  useEffect(() => {
    if (!loaded || under == null) return;
    const id = setTimeout(() => setUnder(null), duration);
    return () => clearTimeout(id);
  }, [loaded, under, duration]);

  const markLoaded = () => {
    loadedSrcRef.current = src;
    setLoaded(true);
  };

  const markErrored = () => {
    setErrored(true);
    setUnder(null);
  };

  return { loaded, errored, under, imgRef, markLoaded, markErrored };
}

// `fill` stretches the container to a positioned parent via inline styles,
// not a className: a losing cascade would collapse the box and the art reads
// black. Otherwise it's a relative box the caller sizes via className.
function containerStyle(
  o: Readonly<Pick<ImageProps, 'fill' | 'radius' | 'background' | 'style'>>,
): CSSProperties {
  return {
    position: o.fill ? 'absolute' : 'relative',
    ...(o.fill ? { top: 0, right: 0, bottom: 0, left: 0 } : null),
    overflow: 'hidden',
    borderRadius: o.radius,
    background: o.background,
    ...o.style,
  };
}

/**
 * Generic image surface with a built-in fade: a shadcn-style drop-in wherever
 * KROMA renders artwork (posters, backdrops, avatars, stills, module icons).
 *
 * Fades in on load, cross-fades the previous image in underneath on a `src`
 * change, and reveals `background` while loading or on error so the surface
 * is never blank.
 *
 * Inline styles plus an opacity transition only, so it works on every client
 * tier including the legacy-TV browsers (no grid, no colour-mix, no util
 * down-levelling). Sizing is the caller's job via `className`/`style`.
 */
export function Image({
  src: requested = null,
  alt = '',
  duration = 400,
  fit = 'cover',
  position = '50% 50%',
  background,
  placeholder,
  fallback,
  radius,
  fill = false,
  className,
  style,
  loading = 'lazy',
  fetchPriority,
  decoding = 'async',
  draggable = false,
  sizes,
  srcSet,
  crossOrigin,
  referrerPolicy,
  onLoad,
  onError,
}: Readonly<ImageProps>) {
  // Checked HERE, once, rather than at the <img> below: artwork URLs come from
  // the server the console is pointed at, and `under` is just an earlier `src`,
  // so sanitising ahead of the cross-fade covers both layers.
  const src = safeImageUrl(requested);
  const { loaded, errored, under, imgRef, markLoaded, markErrored } = useCrossFade(src, duration);

  const handleLoad = (e: SyntheticEvent<HTMLImageElement>) => {
    markLoaded();
    onLoad?.(e);
  };

  const handleError = (e: SyntheticEvent<HTMLImageElement>) => {
    markErrored();
    onError?.(e);
  };

  const showImg = Boolean(src) && !errored;
  const showFallback = fallback != null && (!src || errored);

  return (
    <div className={className} style={containerStyle({ fill, radius, background, style })}>
      {under && under !== src ? (
        <img
          key="under"
          src={under}
          alt=""
          aria-hidden
          draggable={false}
          style={{ ...FILL, objectFit: fit, objectPosition: position }}
        />
      ) : null}

      {placeholder != null && !loaded && !errored ? (
        <div key="placeholder" style={FILL}>
          {placeholder}
        </div>
      ) : null}

      {showImg ? (
        <img
          key={src ?? ''}
          ref={imgRef}
          src={src ?? undefined}
          alt={alt}
          loading={loading}
          fetchPriority={fetchPriority}
          decoding={decoding}
          draggable={draggable}
          sizes={sizes}
          srcSet={srcSet}
          crossOrigin={crossOrigin}
          referrerPolicy={referrerPolicy}
          onLoad={handleLoad}
          onError={handleError}
          style={{
            ...FILL,
            objectFit: fit,
            objectPosition: position,
            opacity: loaded ? 1 : 0,
            transition: `opacity ${duration}ms ease`,
          }}
        />
      ) : null}

      {showFallback ? (
        <div key="fallback" style={FILL}>
          {fallback}
        </div>
      ) : null}
    </div>
  );
}
