import { styles, useStyles } from '#ui/core';
import { GlideBox } from '#ui/lib/glide-box.component';
import type { LensRect, NavPillTone } from './nav-pill-context';

const TRAVEL_MS = 260;
const CHASE_MS = 160;

interface LensProps {
  rect: LensRect | null;
  chase: boolean;
  tone: NavPillTone;
}

/** The amber lens that travels to the item under it. The Root owns it: it is one
 *  box crossing the whole capsule, so no item can draw it. */
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
  lens: { absolute: true, radius: 'pill', willChange: 'transform' },
});

const fillDefinition = styles({ accent: { bg: 'accentSoft' }, neutral: { bg: 'tint/12' } });

export { Lens };
