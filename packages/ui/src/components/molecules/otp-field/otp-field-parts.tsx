import { Children, type ReactNode, useContext } from 'react';
import { Box, type BoxProps } from '#ui/components/atoms/box';
import { Frost } from '#ui/components/atoms/frost';
import { Text } from '#ui/components/atoms/text';
import { Caret } from '#ui/lib/caret';
import {
  OtpGroupStartContext,
  OtpSlotIndexContext,
  type OtpSlot as OtpSlotState,
  useOtpField,
  useOtpSlot,
} from './otp-field-context';
import { otpVariants, SLOT_RADIUS } from './otp-field-variants';

const SLOT_GAP = 12;
const CARET_HEIGHT = { md: 30, tv: 44 } as const;

interface OtpGroupProps extends Omit<BoxProps, 'children'> {
  /** The group's slots. Every DIRECT child is one slot and takes the next
   *  position in the code, whether it is an <OtpField.Slot> or a face of your
   *  own reading `useOtpSlot()`. Separators go BETWEEN groups, not inside one. */
  children?: ReactNode;
}

/** A run of slots the separators break the code into. */
function Group({ children, ...box }: Readonly<OtpGroupProps>) {
  useOtpField('Group');
  const start = useContext(OtpGroupStartContext);
  return (
    // The row is one control: the entry that owns the text lies under the
    // slots, so nothing here may take the tap that belongs to it.
    <Box row align="center" gap={SLOT_GAP} pointerEvents="none" {...box}>
      {Children.map(children, (child, at) => (
        <OtpSlotIndexContext.Provider value={start + at}>{child}</OtpSlotIndexContext.Provider>
      ))}
    </Box>
  );
}

// A filled slot reads as filled even while it is also the active one: the
// character is the stronger signal.
function slotState(slot: OtpSlotState): 'filled' | 'active' | 'empty' {
  if (slot.char != null) return 'filled';
  return slot.active ? 'active' : 'empty';
}

/** One character of the code, as the kit draws it: a glass well, the character
 *  or its dot, and the caret when the next keystroke lands here. */
function Slot() {
  const slot = useOtpSlot();
  const { size, invalid, disabled, mask } = slot;
  const s = otpVariants({ size, state: slotState(slot), invalid, disabled });
  return (
    <Box style={s.slot}>
      {/* The fill is translucent (lib/field-shell), so blur what shows through:
          a code entry over the sign-in artwork reads as glass like every other
          control, rather than as an opaque chip punched out of it. */}
      <Frost radius={SLOT_RADIUS[size]} />
      {slot.char == null ? null : <Text style={s.char}>{mask ? '•' : slot.char}</Text>}
      {slot.caret ? <Caret absolute height={CARET_HEIGHT[size]} /> : null}
    </Box>
  );
}

/** The divider between two groups. */
function Separator() {
  useOtpField('Separator');
  return <Box w={12} h={2} radius="pill" bg="borderStrong" pointerEvents="none" />;
}

export type { OtpGroupProps };
export { Group, Separator, SLOT_GAP, Slot };
