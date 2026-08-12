// On a TV, typing goes through the on-screen keyboard, so the field renders as a
// non-focusable value plus caret - nothing may invite a click that summons the
// platform IME.

import { type ReactNode, type RefObject, useRef, useState } from 'react';
import { type StyleProp, TextInput, type TextInputProps, type TextStyle } from 'react-native';
import { Box, type BoxProps } from '#ui/components/atoms/box';
import { Focusable } from '#ui/components/atoms/focusable';
import { Frost } from '#ui/components/atoms/frost';
import { Icon, type IconName } from '#ui/components/atoms/icon';
import { Text } from '#ui/components/atoms/text';
import { color, styles, useTheme } from '#ui/core';
import { Caret } from '#ui/lib/caret';
import {
  type ControlSize,
  controlMetrics,
  entryDefaultPhysicalKeyboard,
  fieldShell,
  NO_OUTLINE,
  PLACEHOLDER,
} from '#ui/lib/field-shell';
import { useGroupMember } from '#ui/lib/group-shape';
import { useControllable } from '#ui/lib/use-controllable';

type TextFieldType = 'text' | 'email' | 'password' | 'url' | 'search' | 'number';

const TYPE_PROPS: Record<TextFieldType, Partial<TextInputProps>> = {
  text: {},
  email: { keyboardType: 'email-address', autoComplete: 'email', inputMode: 'email' },
  password: { autoComplete: 'current-password' },
  url: { keyboardType: 'url', inputMode: 'url' },
  search: { inputMode: 'search', returnKeyType: 'search' },
  number: { keyboardType: 'numeric', inputMode: 'numeric' },
};

interface TextFieldProps extends Omit<BoxProps, 'children' | 'ring'> {
  value?: string;
  defaultValue?: string;
  onValueChange?: (next: string) => void;
  type?: TextFieldType;
  onSubmit?: () => void;
  /** After the entry takes focus. A shell drawn AROUND this field (see
   *  <InputGroup>) paints the focus state the entry itself gives up. */
  onFocus?: () => void;
  /** After the entry loses focus: the commit point of a save-on-blur field. */
  onBlur?: () => void;
  /** The entry itself, for a caller that has to focus it from outside: give it
   *  a ref and the field uses it instead of its own. */
  entryRef?: RefObject<TextInput | null>;
  placeholder?: string;
  icon?: IconName;
  trailing?: ReactNode;
  physicalKeyboard?: boolean;
  autoFocus?: boolean;
  /** Explicit override; normally derived from `type`. */
  keyboardType?: 'default' | 'url' | 'email-address';
  /** Explicit override; normally derived from `type`. A registration form's
   *  password field says `new-password` here, or the browser's manager fills
   *  the CURRENT password into it and never offers to generate one. */
  autoComplete?: NonNullable<TextInputProps['autoComplete']>;
  invalid?: boolean;
  /** A value to read and copy, not to change: the entry still focuses and
   *  still selects, so a share link can be picked up with the keyboard. */
  readOnly?: boolean;
  /** Select the whole value when the entry takes focus, which is what a
   *  one-shot value (a link, a token) wants: focus it and copy it. */
  selectOnFocus?: boolean;
  label?: string;
  /** The control shell's size. Defaults to the app's (`setEntryDefaults`), so a
   *  call site states this only when it differs from the rest of the app. */
  size?: ControlSize;
  textStyle?: StyleProp<TextStyle>;
  /** The shell belongs to something else - the well of an <InputGroup>, the row
   *  of a command palette. See `fieldShell` for what that drops and why. */
  flat?: boolean;
}

function TextField({
  value: valueProp,
  defaultValue = '',
  onValueChange,
  type = 'text',
  onSubmit,
  onFocus,
  onBlur,
  entryRef,
  placeholder,
  icon,
  trailing,
  physicalKeyboard = entryDefaultPhysicalKeyboard(),
  autoFocus = false,
  keyboardType,
  autoComplete,
  invalid = false,
  readOnly = false,
  selectOnFocus = false,
  label,
  size,
  textStyle,
  flat = false,
  ...box
}: Readonly<TextFieldProps>) {
  const theme = useTheme();
  // A field is a member of a <ButtonGroup> like a button is: it takes the
  // group's size, flattens the corners it shares and lifts itself while it
  // wears the ring, so an entry welds to the control beside it.
  const group = useGroupMember(onFocus, onBlur);
  const metrics = controlMetrics(size ?? group.size ?? undefined);
  const CONTENT = metrics.line;
  const [value, setValue] = useControllable(valueProp, defaultValue, onValueChange);
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const own = useRef<TextInput>(null);
  const input = entryRef ?? own;
  const keyboardProps = keyboardType ? { keyboardType } : null;
  const autoCompleteProps = autoComplete ? { autoComplete } : null;
  const masked = type === 'password' && !revealed;
  const shell = fieldShell(metrics, { flat, focused, invalid, lift: true });
  return (
    <Box
      row
      align="center"
      gap={metrics.gap}
      // A side holding a glyph well or an inner button insets by py, not px,
      // so the glyph sits as far from its edge as from the top and bottom;
      // only a side where TEXT meets the edge keeps the wider px.
      pl={icon ? metrics.py : metrics.px}
      pr={type === 'password' || trailing ? metrics.py : metrics.px}
      py={metrics.py}
      {...shell.box}
      {...box}
      // The whole field is the caret's landing zone: tapping the icon or the
      // padding focuses the entry. Only presses no inner control claimed reach
      // here, and a drag stolen by a surrounding list never releases here.
      onStartShouldSetResponder={() => physicalKeyboard}
      onResponderRelease={() => input.current?.focus()}
      // The amber ring every other control wears, rather than a 1px edge
      // recolour: a field is a focus target like any other and must read as one
      // from three metres. `flat` hands all of it to the surrounding shell.
      style={[shell.edge, group.style, box.style]}
    >
      {/* The fill is translucent (lib/field-shell), so blur what shows
          through: a field over artwork reads as glass, not as a window. */}
      {flat ? null : <Frost radius={metrics.radius} />}
      {/* The well is fixed at the entry's content height so a leading icon can
          never set the row height. */}
      {icon ? (
        <Box w={CONTENT} h={CONTENT} center>
          <Icon name={icon} size={20} stroke={1.8} color="text/50" />
        </Box>
      ) : null}
      {physicalKeyboard ? (
        <TextInput
          ref={input}
          {...TYPE_PROPS[type]}
          value={value}
          onChangeText={setValue}
          onSubmitEditing={onSubmit}
          onFocus={() => {
            setFocused(true);
            group.onFocus();
          }}
          onBlur={() => {
            setFocused(false);
            group.onBlur();
          }}
          readOnly={readOnly}
          selectTextOnFocus={selectOnFocus}
          placeholder={placeholder}
          placeholderTextColor={color(PLACEHOLDER)}
          accessibilityLabel={label}
          autoFocus={autoFocus}
          autoCorrect={false}
          autoCapitalize="none"
          spellCheck={false}
          secureTextEntry={masked}
          {...keyboardProps}
          {...autoCompleteProps}
          selectionColor={theme.colors.accent}
          style={[
            s.input,
            NO_OUTLINE,
            { color: theme.colors.text, minHeight: CONTENT, fontSize: metrics.fontSize },
            textStyle,
          ]}
        />
      ) : (
        <SoftValue
          value={value}
          masked={masked}
          placeholder={placeholder}
          content={CONTENT}
          fontSize={metrics.fontSize}
          textStyle={textStyle}
        />
      )}
      {type === 'password' ? (
        <>
          {/* The reveal button is out of the layout - a spacer reserves its
              width, the button is absolutely positioned over it - because in
              flow its padding set the row height. */}
          <Box w={CONTENT} />
          <RevealButton
            revealed={revealed}
            onToggle={() => setRevealed((prev) => !prev)}
            // Anchored where the spacer's well sits: pr (= py) plus the well's
            // own centring of the glyph, so the eye lines up with the leading
            // icon's inset on the other side.
            right={metrics.py + (CONTENT - REVEAL_SIZE) / 2}
          />
        </>
      ) : null}
      {trailing}
    </Box>
  );
}

// The TV spelling of the same field, so it must measure the same: the shell's
// font size (not <Text>'s `body` role, which is a different size at `sm`), and a
// line box exactly the content row - native CLIPS text whose lineHeight
// overflows its box, where the web merely spills, so an inherited 1.55 ratio
// mis-seats the value on tvOS alone.
function SoftValue({
  value,
  masked,
  placeholder,
  content,
  fontSize,
  textStyle,
}: Readonly<{
  value: string;
  masked: boolean;
  placeholder: string | undefined;
  content: number;
  fontSize: number;
  textStyle: StyleProp<TextStyle>;
}>) {
  const shown = masked ? '•'.repeat(value.length) : value;
  return (
    <Box row align="center" flex gap={2} h={content}>
      <Text
        lines={1}
        style={[s.tvValue, { fontSize, lineHeight: content }, textStyle]}
        color={value ? 'text' : PLACEHOLDER}
      >
        {shown || placeholder || ''}
      </Text>
      <Caret height={content} />
    </Box>
  );
}

function RevealButton({
  revealed,
  onToggle,
  right,
}: Readonly<{ revealed: boolean; onToggle: () => void; right: number }>) {
  return (
    <Box absolute style={[s.revealSlot, { right }]}>
      <Focusable
        label={revealed ? 'Hide password' : 'Show password'}
        ring={false}
        onPress={onToggle}
        style={s.reveal}
        states={REVEAL_STATES}
      >
        <Icon name={revealed ? 'eye-off' : 'eye'} size={REVEAL_SIZE} stroke={1.8} color="text/50" />
      </Focusable>
    </Box>
  );
}

const REVEAL_SIZE = 20;
const REVEAL_STATES = { hover: { bg: 'tint/10' } } as const;

const s = styles({
  input: { flex: true, minW: 0, borderWidth: 0, bg: 'transparent', p: 0 },
  tvValue: { shrink: 1 },
  revealSlot: { top: 0, bottom: 0, justify: 'center' },
  reveal: { p: 4, m: -4, radius: 'md' },
});

export type { TextFieldProps, TextFieldType };
export { TextField };
