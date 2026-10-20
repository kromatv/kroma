import { useEffect, useRef } from 'react';
import type { FrostLayer } from './context';

const HIDDEN = { display: 'none' } as const;

/** Rendered inside a frosted surface: hands the surface to the frost layer. */
export function FrostMark({ layer }: Readonly<{ layer: FrostLayer }>) {
  const mark = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = mark.current;
    return el ? layer.register(el) : undefined;
  }, [layer]);
  return <span ref={mark} style={HIDDEN} aria-hidden />;
}
