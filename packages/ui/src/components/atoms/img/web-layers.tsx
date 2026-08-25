import type { CSSProperties, ReactNode } from 'react';

interface WebLayersArgs {
  src: string | null;
  under: string | null;
  alt: string;
  fit: 'cover' | 'contain';
  position: string;
  radius: number | undefined;
  priority: boolean;
  duration: number;
  errored: boolean;
  markLoaded: () => void;
  onLoad: (() => void) | undefined;
  onError: () => void;
}

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
            if (!(el?.complete && el.naturalWidth > 0)) return;
            el.style.animation = 'none';
            at.markLoaded();
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
          // The fade is an ANIMATION the browser owns (`kroma-img-in`, in
          // styles.css), never an opacity React drives: the resting state is
          // VISIBLE, so a missed load event cannot leave decoded art invisible.
          style={{ ...layer, animation: `kroma-img-in ${at.duration}ms ease both` }}
        />
      ) : null}
    </>
  );
}

export { webLayers };
