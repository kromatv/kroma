import type { ReactNode, SyntheticEvent } from 'react';
import { resolveStyles, type StyleScope, sharedStyle, styles } from '#ui/core';
import type { Radius } from '#ui/core/tokens/layout';
import { classes } from '#ui/lib/classed';

interface WebLayersArgs {
  src: string | null;
  under: string | null;
  alt: string;
  fit: 'cover' | 'contain';
  position: string;
  radius: Radius | undefined;
  priority: boolean;
  duration: number;
  errored: boolean;
  layered: boolean;
  markLoaded: () => void;
  onLoad: (() => void) | undefined;
  onError: () => void;
}

// Chrome doesn't reliably clip a border-radius on a composited descendant, and
// an <img> is exactly that, so the image rounds itself too.
const sDefinition = styles({
  layer: { fill: true, width: '100%', height: '100%' },
  cover: { objectFit: 'cover' },
  contain: { objectFit: 'contain' },
  layered: { willChange: 'opacity' },
});

const fadeIn = (duration: number, scope: StyleScope) =>
  sharedStyle(
    `img:reveal:${duration}`,
    {
      transitionProperty: 'opacity',
      transitionDuration: `${duration}ms`,
      transitionTimingFunction: 'ease',
    },
    scope,
  );

const REVEAL = 'data-kroma-reveal';

function reveal(event: SyntheticEvent<HTMLImageElement>): void {
  event.currentTarget.setAttribute(REVEAL, 'in');
}

function webLayers(at: Readonly<WebLayersArgs>, scope: StyleScope): ReactNode {
  const layer = [
    resolveStyles(sDefinition, scope).layer,
    resolveStyles(sDefinition, scope)[at.fit],
    sharedStyle(`img:position:${at.position}`, { objectPosition: at.position }, scope),
    at.radius === undefined
      ? null
      : sharedStyle(`img:radius:${at.radius}`, { radius: at.radius }, scope),
    at.layered ? resolveStyles(sDefinition, scope).layered : null,
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
          {...{ [REVEAL]: 'wait' }}
          ref={(el) => {
            if (!(el?.complete && el.naturalWidth > 0)) return;
            el.setAttribute(REVEAL, 'shown');
            at.markLoaded();
          }}
          loading={at.priority ? 'eager' : 'lazy'}
          fetchPriority={at.priority ? 'high' : undefined}
          decoding="async"
          draggable={false}
          onLoad={(event) => {
            reveal(event);
            at.markLoaded();
            at.onLoad?.();
          }}
          onError={at.onError}
          className={classes(...layer, fadeIn(at.duration, scope))}
        />
      ) : null}
    </>
  );
}

export { webLayers };
