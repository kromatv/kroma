import { useCallback, useMemo, useState } from 'react';
import { type StyleScope, sharedStyle } from '#ui/core';
import { useStyleScope } from '#ui/core/style-context';
import type { Radius } from '#ui/core/tokens/layout';
import type { FocusRingPart } from '#ui/lib/focus-ring-part';
import { type RingPlacement, ringOf, useRingScope } from '#ui/lib/ring-scope';

const INSIDE: ReadonlySet<string> = new Set(['inside', 'focusInset', 'focusEdge']);

function placementOf(ring: string): RingPlacement {
  return INSIDE.has(ring) ? 'inside' : 'outside';
}

const cornerOf = (corner: Radius | undefined, scope: StyleScope) =>
  corner === undefined
    ? null
    : sharedStyle(`ring-scope:corner:${corner}`, { radius: corner }, scope);

interface RingOwnerInput {
  ring: boolean | RingPlacement;
  visible: boolean;
}

/** The ring a <Focusable> draws: the placement it names or its container's,
 *  on itself unless a <FocusRing> inside has taken it. `corner` is the shape a
 *  container hands a member that states none, laid under the control's own. */
export function useRingOwner({ ring, visible }: Readonly<RingOwnerInput>) {
  const scoped = useRingScope();
  const style = useStyleScope();
  const placement = typeof ring === 'string' ? placementOf(ring) : (scoped?.placement ?? 'outside');
  const ringToken = ringOf(placement);
  const [parts, setParts] = useState(0);
  const claim = useCallback(() => {
    setParts((count) => count + 1);
    return () => setParts((count) => count - 1);
  }, []);
  const part = useMemo<FocusRingPart>(
    () => ({ visible, token: ring === false ? null : ringToken, claim }),
    [visible, ring, ringToken, claim],
  );
  const corner = placement === 'inside' ? cornerOf(scoped?.corner, style) : null;
  return { ringToken, showRing: ring !== false && parts === 0, part, corner };
}
