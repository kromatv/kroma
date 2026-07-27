// <TextField>: the bordered entry field, in both of the modes a 10-foot app
// needs.
//
// On a shell with a physical keyboard (the desktop app, a dev browser) it is a
// real, focusable TextInput the user types into. On an actual TV, where typing
// goes through the on-screen keyboard, it is a NON-focusable display of the
// current value plus a blinking caret, so nothing invites a click that would
// summon the platform IME. The two modes are pixel-matched by construction:
// they share the field, the icon slot and the text style.
//
// The field itself owns the focus visual (a calm accent border) rather than
// letting the 10-foot amber ring box the inner control, which is the shadcn
// InputGroup behaviour this replaces. Like a shadcn input it takes a `type`:
// one prop turns the same field into an email, password (with its reveal eye),
// URL, search or number entry, instead of each screen re-deriving keyboard
// flags. And like every kit form primitive it runs controlled (pass `value`)
// or uncontrolled (pass `defaultValue`), the Radix contract.

import { type ReactNode, useRef, useState } from 'react';
import { type StyleProp, TextInput, type TextInputProps, type TextStyle } from 'react-native';
import { Box, type BoxProps } from '#ui/components/atoms/box';
import { Focusable } from '#ui/components/atoms/focusable';
import { Icon, type IconName } from '#ui/components/atoms/icon';
import { Txt } from '#ui/components/atoms/text';
import { Caret } from '#ui/lib/caret';
import { colors, radius as radii } from '#ui/lib/tokens';
import { useControllable } from '#ui/lib/use-controllable';

/** What the field holds. Everything the platforms need to treat the entry
 * correctly - keyboard, autofill, masking - hangs off this one word. */
type TextFieldType = 'text' | 'email' | 'password' | 'url' | 'search' | 'number';

/** Per-type TextInput wiring. One table instead of per-screen flag soup. */
const TYPE_PROPS: Record<TextFieldType, Partial<TextInputProps>> = {
  text: {},
  email: { keyboardType: 'email-address', autoComplete: 'email', inputMode: 'email' },
  password: { autoComplete: 'current-password' },
  url: { keyboardType: 'url', inputMode: 'url' },
  search: { inputMode: 'search', returnKeyType: 'search' },
  number: { keyboardType: 'numeric', inputMode: 'numeric' },
};

interface TextFieldProps extends Omit<BoxProps, 'children' | 'onChange'> {
  /** Present: you own the state (controlled). Absent: the field runs itself
   *  from `defaultValue` and reports through `onChange`. */
  value?: string;
  defaultValue?: string;
  onChange?: (next: string) => void;
  /** What the field holds. `password` masks and grows the reveal eye. */
  type?: TextFieldType;
  /** Fired on Enter. The on-screen keyboard has its own submit key. */
  onSubmit?: () => void;
  placeholder?: string;
  /** Leading glyph inside the field. */
  icon?: IconName;
  /** Control rendered after the entry, inside the field (a Detect button, a
   *  clear button). It keeps its own focus treatment. */
  trailing?: ReactNode;
  /** True when the shell has a real keyboard: renders an editable TextInput.
   *  False (a TV) renders the value plus a blinking caret. */
  physicalKeyboard?: boolean;
  /** Focus on mount so a keyboard user can type immediately. */
  autoFocus?: boolean;
  /** Explicit override; normally derived from `type`. */
  keyboardType?: 'default' | 'url' | 'email-address';
  /** Paint the border red: the field holds a rejected value. Usually set by
   *  <Field error>, the way shadcn couples aria-invalid to FieldError. */
  invalid?: boolean;
  label?: string;
  /** Type of the value and the placeholder. */
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
  // Hoisted out of the JSX: a conditional spread inside a branch of the
  // physicalKeyboard ternary is a ternary inside a ternary, which reads badly
  // exactly where the props are already dense.
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
      // The WHOLE field is the caret's landing zone, the way shadcn's InputGroup
      // behaves: tapping the icon or the padding must focus the entry, not
      // demand a hit on the inner control. The responder only receives presses
      // no inner control claimed (the entry takes its own touches, a trailing
      // button takes its own), and a drag a surrounding list steals never
      // releases here, so scrolling past the field cannot summon the caret.
      onStartShouldSetResponder={() => physicalKeyboard}
      onResponderRelease={() => input.current?.focus()}
      style={[{ borderColor: edgeColor(focused, invalid) }, box.style]}
    >
      {/* Every field is the SAME height whether or not it carries a glyph. The
          well is fixed at the entry's own content height, so a leading icon can
          never be the thing that sets the row's height - which is how fields
          with an icon ended up taller than their plain neighbours in the same
          form. */}
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
          {/* A password field must be EXACTLY as tall as a text field, so the
              reveal button is taken out of the layout: a zero-height spacer
              reserves its width (the value never runs under the glyph) and the
              button itself is absolutely positioned over that space. In flow,
              its padding set the row's height and password fields came out
              taller than their neighbours in the same form. */}
          <Box w={CONTENT} />
          <Box absolute style={REVEAL_SLOT}>
            <Focusable
              label={revealed ? 'Hide password' : 'Show password'}
              ring={false}
              onPress={() => setRevealed((prev) => !prev)}
              style={REVEAL}
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

/** The field's edge. Focus wins over invalid: while you are fixing the value,
 * the field should look like the thing you are working in, not like a failure. */
function edgeColor(focused: boolean, invalid: boolean): string {
  if (focused) return colors.accent;
  return invalid ? colors.danger : colors.borderStrong;
}

const PLACEHOLDER = 'rgba(244, 243, 240, 0.3)';

/** The height of a field's content row, independent of what sits in it: the
 * entry never measures shorter than this and the glyph wells never measure
 * taller, so every field in a form lines up regardless of icons. A caller who
 * sets a bigger `textStyle` font still grows the field, which is intended -
 * what must not vary is a field's height against its own neighbours. */
const CONTENT = 24;

const INPUT = {
  flex: 1,
  minWidth: 0,
  minHeight: CONTENT,
  borderWidth: 0,
  backgroundColor: 'transparent',
  padding: 0,
} as const;

/** Web only, and `none` rather than width 0: Chrome's own focus ring is
 * `outline-style: auto`, which ignores the width - the field kept its blue
 * browser ring inside the kit's amber one until the STYLE was cleared. React
 * Native's types don't know `none` (native has no outline at all), hence the
 * cast. */
const NO_OUTLINE = { outlineStyle: 'none', outlineWidth: 0 } as unknown as TextStyle;

const REVEAL_SIZE = 20;
/** Centred on the field's right edge, inside its own padding. */
const REVEAL_SLOT = { right: 22, top: 0, bottom: 0, justifyContent: 'center' } as const;
const REVEAL = { padding: 4, margin: -4, borderRadius: radii.md } as const;

export type { TextFieldProps, TextFieldType };
export { TextField };
