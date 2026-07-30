// On a TV, typing goes through the on-screen keyboard, so the field renders as a
// non-focusable value plus caret - nothing may invite a click that summons the
// platform IME.

import { type ReactNode, useRef, useState } from 'react';
import { type StyleProp, TextInput, type TextInputProps, type TextStyle } from 'react-native';
import { Box, type BoxProps } from '#ui/components/atoms/box';
import { Focusable } from '#ui/components/atoms/focusable';
import { Icon, type IconName } from '#ui/components/atoms/icon';
import { Txt } from '#ui/components/atoms/text';
import { Caret } from '#ui/lib/caret';
import { CONTENT_LINE as CONTENT, edgeColor, NO_OUTLINE, PLACEHOLDER } from '#ui/lib/field-shell';
import { colors, radius as radii } from '#ui/lib/tokens';
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

interface TextFieldProps extends Omit<BoxProps, 'children' | 'onChange'> {
  value?: string;
  defaultValue?: string;
  onChange?: (next: string) => void;
  type?: TextFieldType;
  onSubmit?: () => void;
  placeholder?: string;
  icon?: IconName;
  trailing?: ReactNode;
  physicalKeyboard?: boolean;
  autoFocus?: boolean;
  /** Explicit override; normally derived from `type`. */
  keyboardType?: 'default' | 'url' | 'email-address';
  invalid?: boolean;
  label?: string;
  textStyle?: StyleProp<TextStyle>;
}

function TextField({
  value: valueProp,
  defaultValue = '',
  onChange,
  type = 'text',
  onSubmit,
  placeholder,
  icon,
  trailing,
  physicalKeyboard = false,
  autoFocus = true,
  keyboardType,
  invalid = false,
  label,
  textStyle,
  ...box
}: Readonly<TextFieldProps>) {
  const [value, setValue] = useControllable(valueProp, defaultValue, onChange);
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const input = useRef<TextInput>(null);
  const keyboardProps = keyboardType ? { keyboardType } : null;
  const masked = type === 'password' && !revealed;
  return (
    <Box
      row
      align="center"
      gap={14}
      px={22}
      radius="2xl"
      borderWidth={1}
      {...box}
      // The whole field is the caret's landing zone: tapping the icon or the
      // padding focuses the entry. Only presses no inner control claimed reach
      // here, and a drag stolen by a surrounding list never releases here.
      onStartShouldSetResponder={() => physicalKeyboard}
      onResponderRelease={() => input.current?.focus()}
      style={[{ borderColor: edgeColor(focused, invalid) }, box.style]}
    >
      {/* The well is fixed at the entry's content height so a leading icon can
          never set the row height. */}
      {icon ? (
        <Box w={CONTENT} h={CONTENT} center>
          <Icon name={icon} size={20} stroke={1.8} color="rgba(244, 243, 240, 0.5)" />
        </Box>
      ) : null}
      {physicalKeyboard ? (
        <TextInput
          ref={input}
          {...TYPE_PROPS[type]}
          value={value}
          onChangeText={setValue}
          onSubmitEditing={onSubmit}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          placeholderTextColor={PLACEHOLDER}
          accessibilityLabel={label}
          autoFocus={autoFocus}
          autoCorrect={false}
          autoCapitalize="none"
          spellCheck={false}
          secureTextEntry={masked}
          {...keyboardProps}
          selectionColor={colors.accent}
          style={[INPUT, NO_OUTLINE, { color: colors.text }, textStyle]}
        />
      ) : (
        <Box row align="center" flex gap={2} h={CONTENT}>
          <Txt
            lines={1}
            style={[{ flexShrink: 1 }, textStyle]}
            color={value ? 'text' : PLACEHOLDER}
          >
            {(masked ? '•'.repeat(value.length) : value) || placeholder || ''}
          </Txt>
          <Caret height={28} />
        </Box>
      )}
      {type === 'password' ? (
        <>
          {/* The reveal button is out of the layout - a spacer reserves its
              width, the button is absolutely positioned over it - because in
              flow its padding set the row height. */}
          <Box w={CONTENT} />
          <Box absolute style={REVEAL_SLOT}>
            <Focusable
              label={revealed ? 'Hide password' : 'Show password'}
              ring={false}
              onPress={() => setRevealed((prev) => !prev)}
              style={REVEAL}
              hoveredStyle={REVEAL_HOVERED}
            >
              <Icon
                name={revealed ? 'eye-off' : 'eye'}
                size={REVEAL_SIZE}
                stroke={1.8}
                color="rgba(244, 243, 240, 0.5)"
              />
            </Focusable>
          </Box>
        </>
      ) : null}
      {trailing}
    </Box>
  );
}

const INPUT = {
  flex: 1,
  minWidth: 0,
  minHeight: CONTENT,
  borderWidth: 0,
  backgroundColor: 'transparent',
  padding: 0,
} as const;

const REVEAL_SIZE = 20;
const REVEAL_SLOT = { right: 22, top: 0, bottom: 0, justifyContent: 'center' } as const;
const REVEAL = { padding: 4, margin: -4, borderRadius: radii.md } as const;
const REVEAL_HOVERED = { backgroundColor: 'rgba(255, 255, 255, 0.1)' } as const;

export type { TextFieldProps, TextFieldType };
export { TextField };
