// What <OtpField>'s parts share: the code the Root holds, and which character
// of it each slot stands for.

import { createContext, useContext } from 'react';
import { partContext } from '#ui/lib/part-context';
import type { OtpSize } from './otp-field-variants';

interface OtpPosition {
  char: string | null;
  /** True for the slot the next character lands in. */
  active: boolean;
  /** True for the one slot drawing the blinking caret. */
  caret: boolean;
}

interface OtpSlot extends OtpPosition {
  size: OtpSize;
  mask: boolean;
  invalid: boolean;
  disabled: boolean;
}

interface OtpFieldState {
  size: OtpSize;
  mask: boolean;
  invalid: boolean;
  disabled: boolean;
  at: (index: number) => OtpPosition;
}

const [OtpFieldContext, useOtpField] = partContext<OtpFieldState>('OtpField.Root');
const OtpGroupStartContext = createContext(0);
const OtpSlotIndexContext = createContext<number | null>(null);

/**
 * The state of the slot the calling component stands for, for a face the kit's
 * own `<OtpField.Slot>` cannot draw. Call it from a DIRECT child of an
 * `<OtpField.Group>`: that is what gives the face its position in the code.
 */
function useOtpSlot(): OtpSlot {
  const field = useContext(OtpFieldContext);
  const index = useContext(OtpSlotIndexContext);
  if (!field || index === null) {
    throw new Error('useOtpSlot() must be called inside an <OtpField.Group>');
  }
  const { size, mask, invalid, disabled } = field;
  return { ...field.at(index), size, mask, invalid, disabled };
}

export type { OtpFieldState, OtpSlot };
export { OtpFieldContext, OtpGroupStartContext, OtpSlotIndexContext, useOtpField, useOtpSlot };
