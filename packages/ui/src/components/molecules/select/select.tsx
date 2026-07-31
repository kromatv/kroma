// Options are presented in a <Dialog> rather than a popover panel: on tvOS a
// modal is its own view controller, so the D-pad is confined to the options,
// and a popover anchored to the trigger is clipped inside a ScrollView.

import { useCallback, useState } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Focusable, type FocusableProps } from '#ui/components/atoms/focusable';
import { Icon, type IconName } from '#ui/components/atoms/icon';
import { Txt } from '#ui/components/atoms/text';
import { Dialog } from '#ui/components/organisms/dialog';
import { sv } from '#ui/core';
import { FocusColumn } from '#ui/lib/focus-scope';
import { useControllable } from '#ui/lib/use-controllable';

// The trigger wears <TextField>'s well, so a form reads as one family.
const triggerVariants = sv({
  slots: {
    root: {
      row: true,
      align: 'center',
      gap: 14,
      px: 22,
      py: 12,
      radius: '2xl',
      border: 'borderStrong',
      _hover: { bg: 'white/6' },
    },
    ink: { shrink: 1 },
  },
  variants: {
    invalid: { true: { root: { border: 'danger' } } },
    filled: { true: { ink: { color: 'text' } }, false: { ink: { color: 'textDim' } } },
  },
  defaults: { invalid: false, filled: false },
});

const optionVariants = sv({
  slots: {
    root: {
      row: true,
      align: 'center',
      gap: 12,
      px: 14,
      py: 12,
      radius: 'md',
      _hover: { bg: 'white/8' },
    },
    ink: { shrink: 1 },
  },
  variants: {
    chosen: { true: { ink: { color: 'text' } }, false: { ink: { color: 'textMuted' } } },
  },
  defaults: { chosen: false },
});

interface SelectOption {
  value: string;
  label: string;
  note?: string;
  icon?: IconName;
}

interface SelectProps extends Omit<FocusableProps, 'children' | 'onPress' | 'style'> {
  label: string;
  options: readonly SelectOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (next: string) => void;
  placeholder?: string;
  invalid?: boolean;
  style?: StyleProp<ViewStyle>;
}

function Select({
  label,
  options,
  value: valueProp,
  defaultValue,
  onChange,
  placeholder = 'Select…',
  disabled = false,
  invalid = false,
  style,
  ...focusProps
}: Readonly<SelectProps>) {
  // '' is "nothing picked": no option may use it, or the placeholder never shows.
  const [value, setValue] = useControllable(valueProp, defaultValue ?? '', onChange);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const current = options.find((option) => option.value === value);

  const pick = useCallback(
    (next: string) => {
      setValue(next);
      setOpen(false);
    },
    [setValue],
  );

  return (
    <>
      <Focusable
        {...focusProps}
        label={`${label}: ${current?.label ?? placeholder}`}
        disabled={disabled}
        onPress={() => setOpen(true)}
        sv={triggerVariants}
        vars={{ invalid, filled: current !== undefined }}
        style={style}
      >
        {(state) => (
          <>
            {current?.icon ? <Icon name={current.icon} size={18} color="textMuted" /> : null}
            <Txt variant="body" lines={1} style={state.slots.ink}>
              {current?.label ?? placeholder}
            </Txt>
            <Box flex />
            <Icon name="chevron-down" size={16} color="textDim" />
          </>
        )}
      </Focusable>

      <Dialog open={open} onClose={close} title={label} width={560}>
        <FocusColumn>
          {options.map((option) => (
            <Option
              key={option.value}
              option={option}
              chosen={option.value === value}
              onPress={() => pick(option.value)}
            />
          ))}
        </FocusColumn>
      </Dialog>
    </>
  );
}

function Option({
  option,
  chosen,
  onPress,
}: Readonly<{ option: SelectOption; chosen: boolean; onPress: () => void }>) {
  return (
    <Focusable label={option.label} onPress={onPress} sv={optionVariants} vars={{ chosen }}>
      {(state) => (
        <>
          {option.icon ? <Icon name={option.icon} size={18} color="textMuted" /> : null}
          <Txt variant="body" lines={1} style={state.slots.ink}>
            {option.label}
          </Txt>
          <Box flex />
          {option.note ? (
            <Txt variant="meta" color="textDim">
              {option.note}
            </Txt>
          ) : null}
          <Box w={18} align="center">
            {chosen ? <Icon name="check" size={16} color="accent" /> : null}
          </Box>
        </>
      )}
    </Focusable>
  );
}

export type { SelectOption, SelectProps };
export { Select };
