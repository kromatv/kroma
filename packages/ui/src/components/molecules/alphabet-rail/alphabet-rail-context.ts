// What <AlphabetRail>'s parts share: the row box the Root sized to the
// viewport, where each letter sits in the rail, and the jump the Root reports.

import { createContext, useContext } from 'react';

/** The letters whose sections are on screen right now, first to last: the
 * stretch the lens covers. */
interface LetterRange {
  first: string;
  last: string;
}

const PAD = 4;
const ROW_W = 32;

interface AlphabetRailState {
  /** Where a letter sits in the rail, or -1. Positions are the Root's: it is
   *  the only thing that has seen every letter. */
  indexOf: (value: string) => number;
  lit: [number, number] | null;
  rowH: number;
  fontSize: number;
  jump: (letter: string) => void;
}

const AlphabetRailContext = createContext<AlphabetRailState | null>(null);

function useAlphabetRail(part: string): AlphabetRailState {
  const state = useContext(AlphabetRailContext);
  if (!state) throw new Error(`<AlphabetRail.${part}> must be used inside <AlphabetRail.Root>`);
  return state;
}

export type { AlphabetRailState, LetterRange };
export { AlphabetRailContext, PAD, ROW_W, useAlphabetRail };
