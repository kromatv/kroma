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
const UNIT = '[data-kroma-fade-unit]';
const WAIT = 'data-kroma-wait';
const ART_IN = 'data-kroma-art-in';

function hold(unit: HTMLElement | null): void {
  unit?.setAttribute(WAIT, '');
  unit?.parentElement?.removeAttribute(ART_IN);
}

function release(unit: HTMLElement | null, shown: boolean): void {
  unit?.removeAttribute(WAIT);
  if (shown) unit?.parentElement?.setAttribute(ART_IN, '');
  else unit?.parentElement?.removeAttribute(ART_IN);
}

function reveal(event: SyntheticEvent<HTMLImageElement>): void {
  const img = event.currentTarget;
  img.setAttribute(REVEAL, 'in');
  release(img.closest<HTMLElement>(UNIT), true);
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
            if (!el) return;
            const unit = el.closest<HTMLElement>(UNIT);
            if (el.getAttribute(REVEAL) === 'in') {
              release(unit, true);
              return;
            }
            if (el.complete && el.naturalWidth > 0) {
              el.setAttribute(REVEAL, 'shown');
              release(unit, true);
              at.markLoaded();
              return;
            }
            hold(unit);
            return () => release(unit, false);
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
