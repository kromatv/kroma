import type { ReactNode } from 'react';
import { sharedStyle, styles } from '#ui/core';
import { classes } from '#ui/lib/classed';

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
  decoded: boolean;
  markDecoded: () => void;
  markLoaded: () => void;
  onLoad: (() => void) | undefined;
  onError: () => void;
}

// Chrome doesn't reliably clip a border-radius on a composited descendant, and
// an <img> is exactly that, so the image rounds itself too.
const s = styles({
  layer: { fill: true, width: '100%', height: '100%' },
  cover: { objectFit: 'cover' },
  contain: { objectFit: 'contain' },
  still: { animationKeyframes: 'none' },
});

const fadeIn = (duration: number) =>
  sharedStyle(`img:fade:${duration}`, {
    animationKeyframes: 'kroma-img-in',
    animationDuration: `${duration}ms`,
    animationTimingFunction: 'ease',
    animationFillMode: 'both',
  });

function webLayers(at: Readonly<WebLayersArgs>): ReactNode {
  const layer = [
    s.layer,
    s[at.fit],
    sharedStyle(`img:position:${at.position}`, { objectPosition: at.position }),
    at.radius === undefined ? null : sharedStyle(`img:radius:${at.radius}`, { radius: at.radius }),
  ];
  return (
    <>
      {at.under && at.under !== at.src ? (
        <img
          key="under"
          src={at.under}
          alt=""
          aria-hidden
          draggable={false}
          className={classes(...layer)}
        />
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
            at.markDecoded();
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
          className={classes(...layer, at.decoded ? s.still : fadeIn(at.duration))}
        />
      ) : null}
    </>
  );
}

export { webLayers };
