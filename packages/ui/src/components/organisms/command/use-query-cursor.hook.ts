import { type Dispatch, type SetStateAction, useState } from 'react';

/** The row the palette's cursor is on, back on the first row whenever the query
 *  moves, whoever moved it. */
function useQueryCursor(query: string): readonly [number, Dispatch<SetStateAction<number>>] {
  const [row, setRow] = useState(0);
  const [under, setUnder] = useState(query);
  if (under !== query) {
    setUnder(query);
    setRow(0);
  }
  return [under === query ? row : 0, setRow];
}

export { useQueryCursor };
