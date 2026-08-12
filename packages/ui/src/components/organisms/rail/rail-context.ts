// What <Rail>'s parts share: the two measurements the Root settled on, so a
// heading and a row are inset and spaced by the same numbers.

import { partContext } from '#ui/lib/part-context';

interface RailState {
  gap: number;
  inset: number;
}

const [RailContext, useRail] = partContext<RailState>('Rail.Root');

export type { RailState };
export { RailContext, useRail };
