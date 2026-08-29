import type { Outline } from '../live';
import { mark } from '../overlay/mark';
import type { Inspector } from './engine';
import { keyLabel } from './label';

function inspecting(label: boolean, marks: boolean): Inspector {
  return (rendered) => {
    const drawn = label ? keyLabel(rendered) : rendered.text;
    return marks ? mark(rendered, drawn) : drawn;
  };
}

const LABELLING = inspecting(true, false);
const MARKING = inspecting(false, true);
const BOTH = inspecting(true, true);

/** The inspector to install for a state of the two switches, and `null` where
 *  neither is on: a message the tools do not change is one they have no reason
 *  to see. One stable function per state rather than a closure per call,
 *  because installing a new identity re-renders every string in the app. */
export function inspectorFor(keys: boolean, outline: Outline): Inspector | null {
  if (outline !== 'off') return keys ? BOTH : MARKING;
  return keys ? LABELLING : null;
}
