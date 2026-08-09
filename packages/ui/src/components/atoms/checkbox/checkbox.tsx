// <Checkbox>: the many-of-N control. A <Switch> says "this is on"; a checkbox
// says "this one is included", which is why a list of them is a selection and
// a list of switches is a settings page.
//
// Same construction as <Switch>: a Focusable that toggles on Select, painting
// its state as a FILL rather than a mark alone, so it reads from three metres.

import { Box } from '#ui/components/atoms/box';
import { Focusable, type FocusableProps } from '#ui/components/atoms/focusable';
import { Icon } from '#ui/components/atoms/icon';
import { sv } from '#ui/core';
import { useControllable } from '#ui/lib/use-controllable';

type CheckboxSize = 'sm' | 'tv';

const BOX = { sm: 20, tv: 28 } as const;

const checkboxVariants = sv({
  base: {
    center: true,
    radius: 6,
    border: 'borderStrong',
    bg: 'white/6',
    _disabled: { opacity: 0.5 },
  },
  variants: {
    size: {
      sm: { w: BOX.sm, h: BOX.sm },
      tv: { w: BOX.tv, h: BOX.tv, radius: 8 },
    },
    /** Checked and mixed both paint the amber fill: a parent row of a partly
     *  selected group is as much "acted on" as a fully selected one. The hover
     *  lives per state so a filled box hovers up the amber ladder rather than
     *  back down to the white wash under its near-black mark (see <Chip>). */
    checked: {
      true: {
        bg: 'accent',
        border: 'accent',
        _hover: { bg: 'accentHover', border: 'accentHover' },
      },
      false: { _hover: { bg: 'white/12', border: 'white/32' } },
    },
  },
  defaults: { size: 'sm', checked: false },
});

interface CheckboxProps
  extends Omit<FocusableProps, 'children' | 'onPress' | 'role' | 'checked' | 'style'> {
  /** Present: you own the state (controlled). Absent: it runs itself from
   *  `defaultChecked` and reports through `onChange`. */
  checked?: boolean;
  defaultChecked?: boolean;
  /** Some of the things under this one are checked. Announced as `mixed`, and
   *  a press from here checks them all. */
  indeterminate?: boolean;
  onChange?: (next: boolean) => void;
  size?: CheckboxSize;
}

function Checkbox({
  checked: checkedProp,
  defaultChecked = false,
  indeterminate = false,
  onChange,
  size = 'sm',
  disabled = false,
  ...focusProps
}: Readonly<CheckboxProps>) {
  const [checked, setChecked] = useControllable(checkedProp, defaultChecked, onChange);
  const on = checked || indeterminate;
  return (
    <Focusable
      {...focusProps}
      role="checkbox"
      checked={indeterminate ? 'mixed' : checked}
      disabled={disabled}
      onPress={() => setChecked(!checked)}
      sv={checkboxVariants}
      vars={{ size, checked: on }}
    >
      <CheckboxMark checked={checked} indeterminate={indeterminate} size={size} />
    </Focusable>
  );
}

interface CheckboxFaceProps {
  checked: boolean;
  indeterminate?: boolean;
  size?: CheckboxSize;
}

/**
 * The checkbox's visuals alone, with nothing pressable about them: for a row
 * that is itself the control (see <ChoiceList>), where a focusable checkbox
 * would be a second stop the D-pad has to fight past.
 */
function CheckboxFace({
  checked,
  indeterminate = false,
  size = 'sm',
}: Readonly<CheckboxFaceProps>) {
  return (
    <Box style={checkboxVariants({ size, checked: checked || indeterminate }).root}>
      <CheckboxMark checked={checked} indeterminate={indeterminate} size={size} />
    </Box>
  );
}

function CheckboxMark({
  checked,
  indeterminate,
  size,
}: Readonly<{ checked: boolean; indeterminate: boolean; size: CheckboxSize }>) {
  if (!checked && !indeterminate) return null;
  return (
    <Icon
      name={indeterminate && !checked ? 'minus' : 'check'}
      size={Math.round(BOX[size] * 0.7)}
      stroke={3}
      color="accentInk"
    />
  );
}

export type { CheckboxFaceProps, CheckboxProps, CheckboxSize };
export { Checkbox, CheckboxFace, checkboxVariants };
