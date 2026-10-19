// The amber lens that travels to the item under it. Owned by the Root: it is
// one box crossing the whole capsule, so no item can draw it.

import { styles, useStyles } from '#ui/core';
import { GlideBox } from '#ui/lib/glide-box';
import type { LensRect, NavPillTone } from './nav-pill-context';

const TRAVEL_MS = 260;
const CHASE_MS = 160;

interface LensProps {
  rect: LensRect | null;
  chase: boolean;
  tone: NavPillTone;
}

function Lens({ rect, chase, tone }: Readonly<LensProps>) {
  const s = useStyles(sDefinition);
  const fill = useStyles(fillDefinition);
  return (
    <GlideBox
      rect={rect}
      durationMs={chase ? CHASE_MS : TRAVEL_MS}
      slideX
      style={[s.lens, fill[tone]]}
    />
  );
}

const sDefinition = styles({
  lens: { absolute: true, left: 0, radius: 'pill', willChange: 'transform' },
});

const fillDefinition = styles({ accent: { bg: 'accentSoft' }, neutral: { bg: 'tint/12' } });

export { Lens };
