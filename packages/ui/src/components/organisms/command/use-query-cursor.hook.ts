import { type Dispatch, type SetStateAction, useState } from 'react';

/** The row the palette's cursor is on, back on `start` whenever `scope` moves: the
 *  query, or the list it is typed into. */
function useQueryCursor(
  scope: string,
  start = 0,
): readonly [number, Dispatch<SetStateAction<number>>] {
  const [row, setRow] = useState(start);
  const [under, setUnder] = useState(scope);
  if (under !== scope) {
    setUnder(scope);
    setRow(start);
  }
  return [under === scope ? row : start, setRow];
}

export { useQueryCursor };
