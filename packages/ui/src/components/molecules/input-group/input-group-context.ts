// What the shell tells its parts.

import { createContext, useContext } from 'react';
import type { ControlMetrics, ControlSize } from '#ui/lib/field-shell';

/** Where an addon sits: `inline` is the control's own row, `block` is a bar
 *  above or below it. */
type AddonAlign = 'inline-start' | 'inline-end' | 'block-start' | 'block-end';

interface InputGroupContext {
  /** The shell's size, handed to the controls the parts wrap. */
  size: ControlSize | undefined;
  metrics: ControlMetrics;
  invalid: boolean;
  /** The padding the control draws itself, zero where an addon holds it. */
  padStart: number;
  padEnd: number;
  /** Told by the control, painted by the shell. */
  onFocusChange: (focused: boolean) => void;
  /** Registered by the control so a press on the padding types into it. */
  registerFocus: (focus: () => void) => void;
  focusControl: () => void;
}

const Context = createContext<InputGroupContext | null>(null);

/** What an addon tells each control inside it: the side, and whether the
 *  control sits at the addon's outer edge (only that one pulls in). */
interface AddonSlot {
  align: AddonAlign;
  edge: boolean;
}

const AddonContext = createContext<AddonSlot | null>(null);

function useAddonSlot(): AddonSlot | null {
  return useContext(AddonContext);
}

function useInputGroup(part: string): InputGroupContext {
  const ctx = useContext(Context);
  if (!ctx) throw new Error(`<InputGroup.${part}> must be used inside <InputGroup.Root>`);
  return ctx;
}

/** How far a control inside the shell sits from its edge. */
const INSET = 6;

export type { AddonAlign, AddonSlot, InputGroupContext };
export { AddonContext, Context, INSET, useAddonSlot, useInputGroup };
