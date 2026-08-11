// <Radio>: the one-of-N control. Unlike a checkbox it cannot be un-picked by
// pressing it again - the only way out of a choice is another choice - so a
// press always reports `true` and the group owns which one is on.
//
// A radio never travels alone: use <ChoiceList mode="single">, or put these
// inside a container that is a `radiogroup` to assistive tech.

import { Box } from '#ui/components/atoms/box';
import { Focusable, type FocusableProps } from '#ui/components/atoms/focusable';
import { sv } from '#ui/core';

type RadioSize = 'sm' | 'tv';

const BOX = { sm: 20, tv: 28 } as const;

const radioVariants = sv({
  slots: {
    root: {
      center: true,
      radius: 'circle',
      border: 'borderStrong',
      bg: 'tint/6',
      _disabled: { opacity: 0.5 },
    },
    // The dot is a layer rather than a glyph: a circle inside a circle stays
    // concentric at any size, where a check mark has to be optically nudged.
    dot: { radius: 'circle', bg: 'accentInk' },
  },
  variants: {
    size: {
      sm: { root: { w: BOX.sm, h: BOX.sm }, dot: { w: 8, h: 8 } },
      tv: { root: { w: BOX.tv, h: BOX.tv }, dot: { w: 11, h: 11 } },
    },
    checked: {
      true: {
        root: {
          bg: 'accent',
          border: 'accent',
          _hover: { bg: 'accentHover', border: 'accentHover' },
        },
      },
      false: { root: { _hover: { bg: 'tint/12', border: 'tint/32' } } },
    },
  },
  defaults: { size: 'sm', checked: false },
});

interface RadioProps
  extends Omit<FocusableProps, 'children' | 'onPress' | 'role' | 'checked' | 'style'> {
  checked: boolean;
  /** Fired on a press that PICKS this one. A press on the chosen radio is not
   *  a change, so nothing is reported. */
  onChange?: () => void;
  size?: RadioSize;
}

function Radio({
  checked,
  onChange,
  size = 'sm',
  disabled = false,
  ...focusProps
}: Readonly<RadioProps>) {
  return (
    <Focusable
      {...focusProps}
      role="radio"
      checked={checked}
      disabled={disabled}
      onPress={() => {
        if (!checked) onChange?.();
      }}
      sv={radioVariants}
      vars={{ size, checked }}
    >
      {(state) => (checked ? <Box style={state.slots.dot} /> : null)}
    </Focusable>
  );
}

interface RadioFaceProps {
  checked: boolean;
  size?: RadioSize;
}

/** The radio's visuals alone, for a row that is itself the control. */
function RadioFace({ checked, size = 'sm' }: Readonly<RadioFaceProps>) {
  const s = radioVariants({ size, checked });
  return <Box style={s.root}>{checked ? <Box style={s.dot} /> : null}</Box>;
}

export type { RadioFaceProps, RadioProps, RadioSize };
export { Radio, RadioFace, radioVariants };
