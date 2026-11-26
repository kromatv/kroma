import { useCallback, useState } from 'react';

const SUBPIXEL = 1;

const NONE: readonly number[] = [];

function withHeading(headings: readonly number[], at: number, width: number): readonly number[] {
  if ((headings[at] ?? 0) === width) {
    return headings;
  }
  return Array.from({ length: Math.max(headings.length, at + 1) }, (_, column) =>
    column === at ? width : (headings[column] ?? 0),
  );
}

function useHeadingWidths(): {
  headings: readonly number[];
  fit: (at: number, width: number) => void;
} {
  const [headings, setHeadings] = useState(NONE);
  const fit = useCallback((at: number, width: number) => {
    const needed = width > 0 ? Math.ceil(width) + SUBPIXEL : 0;
    setHeadings((was) => withHeading(was, at, needed));
  }, []);
  return { headings, fit };
}

export { useHeadingWidths };
