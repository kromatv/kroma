// <Select>: pick one of a few, from a trigger that says what is picked.
//
// The kit went without one for a while because its two ancestors both already
// existed and neither generalised: the workbench toolbar's lens menu hangs an
// absolutely-positioned panel off its trigger, which only works because the
// toolbar is the topmost row of its column and nothing clips it - a form deep
// in a ScrollView clips it on the first scroll - and the player's settings
// panel is a whole in-player navigation surface, not a control.
//
// So the options are presented in a <Dialog>, and that is a choice about the
// TELEVISION rather than a shortcut: a modal is its own view controller on
// tvOS, so the D-pad is confined to the options for free, exactly as it is in
// the track pickers the player already ships. On a phone a full-window sheet is
// how a native picker behaves anyway, and on the web the dialog's focus scope
// keeps the spatial navigator inside. One presentation, every target - the same
// argument as the dialog it stands on.
//
// The trigger is dressed as the ENTRY it sits beside (same radius, same edge,
// same focus ring rules as <TextField>), because a form should read as one
// family of controls - and like shadcn's SelectTrigger it is labelled by its
// value: the closed state answers "what is picked" without being opened.

import { useCallback, useState } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Focusable, type FocusableProps } from '#ui/components/atoms/focusable';
import { Icon, type IconName } from '#ui/components/atoms/icon';
import { Txt } from '#ui/components/atoms/text';
import { Dialog } from '#ui/components/organisms/dialog';
import { FocusColumn } from '#ui/lib/focus-scope';
import { colors, radius } from '#ui/lib/tokens';
import { useControllable } from '#ui/lib/use-controllable';

interface SelectOption {
  value: string;
  label: string;
  /** Trailing detail, dimmed: a codec, a resolution, a count. What turns "the
   *  second one" into a choice made without opening anything else. */
  note?: string;
  /** Leading glyph for the option row, and for the trigger while chosen. */
  icon?: IconName;
}

interface SelectProps extends Omit<FocusableProps, 'children' | 'onPress' | 'style'> {
  /** Names the control: the accessible name, and the title over the options. */
  label: string;
  options: readonly SelectOption[];
  /** Present: you own the state (controlled). Absent: the select runs itself
   *  from `defaultValue` and reports through `onChange`. */
  value?: string;
  defaultValue?: string;
  onChange?: (next: string) => void;
  /** The closed state before anything is picked. */
  placeholder?: string;
  /** Paint the edge red: the field holds a rejected value. Usually set by
   *  <Field error>, the same coupling <TextField invalid> has. */
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
  // '' is "nothing picked": no option may use it, so the placeholder shows.
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
        style={[TRIGGER, { borderColor: invalid ? colors.danger : colors.borderStrong }, style]}
        hoveredStyle={TRIGGER_HOVERED}
      >
        {current?.icon ? <Icon name={current.icon} size={18} color="textMuted" /> : null}
        <Txt variant="body" color={current ? 'text' : 'textDim'} lines={1} style={TRIGGER_INK}>
          {current?.label ?? placeholder}
        </Txt>
        <Box flex />
        <Icon name="chevron-down" size={16} color="textDim" />
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

/** One option row: its glyph, its name, its detail, and the tick on the chosen
 * one. The tick keeps its column whether or not it is drawn, so the notes down
 * the right edge stay in one line - the same rule the toolbar's menus follow. */
function Option({
  option,
  chosen,
  onPress,
}: Readonly<{ option: SelectOption; chosen: boolean; onPress: () => void }>) {
  return (
    <Focusable label={option.label} onPress={onPress} style={ROW} hoveredStyle={ROW_HOVERED}>
      {option.icon ? <Icon name={option.icon} size={18} color="textMuted" /> : null}
      <Txt variant="body" color={chosen ? 'text' : 'textMuted'} lines={1} style={ROW_INK}>
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
    </Focusable>
  );
}

/** Dressed as the entry it sits beside: <TextField>'s well, minus the caret. */
const TRIGGER = {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 14,
  paddingHorizontal: 22,
  paddingVertical: 12,
  borderRadius: radius['2xl'],
  borderWidth: 1,
} as const;
const TRIGGER_INK = { flexShrink: 1 } as const;
/** The well fills faintly under the cursor. It carries no focus scale and its
 * border is already spoken for (invalid paints it red), so the fill is the one
 * channel left to answer a pointer with. */
const TRIGGER_HOVERED = { backgroundColor: 'rgba(255, 255, 255, 0.06)' } as const;
const ROW = {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 12,
  paddingHorizontal: 14,
  paddingVertical: 12,
  borderRadius: radius.md,
} as const;
const ROW_INK = { flexShrink: 1 } as const;
/** An option row has no resting fill at all, so hover IS its box. */
const ROW_HOVERED = { backgroundColor: 'rgba(255, 255, 255, 0.08)' } as const;

export type { SelectOption, SelectProps };
export { Select };
