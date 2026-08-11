// What <Rail>'s parts share: the two measurements the Root settled on, so a
// heading and a row are inset and spaced by the same numbers.

import { createContext, useContext } from 'react';

interface RailState {
  gap: number;
  inset: number;
}

const RailContext = createContext<RailState | null>(null);

function useRail(part: string): RailState {
  const state = useContext(RailContext);
  if (!state) throw new Error(`<Rail.${part}> must be used inside <Rail.Root>`);
  return state;
}

export type { RailState };
export { RailContext, useRail };
