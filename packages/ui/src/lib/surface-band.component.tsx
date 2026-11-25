import { createContext, type ReactNode, useContext, useEffect } from 'react';
import { warnInDevelopment } from './dev-warning';

const InsideBand = createContext(false);

interface PlacedBandsProps {
  /** The surface placing them, as its Root is written (`Dialog`). */
  surface: string;
  /** The children the Root has nowhere to draw: `surfaceBands` counts them. */
  unplaced: number;
  children: ReactNode;
}

/**
 * Wraps the bands a surface Root placed. A surface opened from inside another
 * surface's band starts over here, so its own bands are not taken for nested
 * ones. Warns, in development, when the Root was given a panel and children
 * that are no band, which it does not draw. See {@link SurfaceBand}.
 */
function PlacedBands({ surface, unplaced, children }: Readonly<PlacedBandsProps>) {
  useEffect(() => {
    if (unplaced > 0) {
      warnInDevelopment(
        `<${surface}.Root> was given a <${surface}.Panel>, so it draws nothing else that is not a band (children left out: ${unplaced}). Write them inside the panel, and write a band in <${surface}.Root>'s own children, not in a component of your own.`,
      );
    }
  }, [surface, unplaced]);
  return <InsideBand value={false}>{children}</InsideBand>;
}

/**
 * One band of a surface, named as it is written (`Dialog.Footer`). Warns, in
 * development, when it renders inside another band: a band returned by a
 * component of the caller's own is loose content to the Root, which draws it
 * inside its scrolling panel.
 */
function SurfaceBand({ part, children }: Readonly<{ part: string; children: ReactNode }>) {
  const nested = useContext(InsideBand);
  useEffect(() => {
    if (nested) {
      const root = `${part.slice(0, part.indexOf('.'))}.Root`;
      warnInDevelopment(
        `<${part}> is not a direct child of <${root}>, so the Root cannot place it and draws it inside its scrolling panel. Write it in <${root}>'s own children, not in a component of your own.`,
      );
    }
  }, [nested, part]);
  return <InsideBand value>{children}</InsideBand>;
}

export { PlacedBands, SurfaceBand };
