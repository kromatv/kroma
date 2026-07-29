// <TextArea>: the multi-line entry, in both of the modes a 10-foot app needs.
//
// It is <TextField>'s taller sibling and shares its whole shape on purpose: the
// same bordered box, the same calm accent border for focus, the same red edge
// for a rejected value, the same controlled (`value`) or uncontrolled
// (`defaultValue`) contract, and the same two modes - a real TextInput on a
// shell with a physical keyboard, and a NON-focusable display of the value plus
// a blinking caret on a television, where typing goes through the on-screen
// keyboard and nothing should invite a tap that summons the platform IME.
//
// What it adds is height. `rows` is the floor it opens at, and the field GROWS
// with what is typed into it up to `maxRows`, past which it scrolls instead of
// pushing the rest of the form off the screen. That is shadcn's
// `field-sizing-content` behaviour, and it is worth the machinery: a note typed
// into a fixed two-line slot is written half-blind, with the beginning of it
// scrolled out of sight.
//
// The growth is measured in exactly one place per platform. A browser sizes the
// control itself through `field-sizing` (no measure, no re-render); native has
// no such property, so there the entry reports its content height and this
// component sets the height it clamps to.

import { useRef, useState } from 'react';
import {
  Platform,
  type StyleProp,
  TextInput,
  type TextInputContentSizeChangeEvent,
  type TextStyle,
} from 'react-native';
import { Box, type BoxProps } from '#ui/components/atoms/box';
import { Txt } from '#ui/components/atoms/text';
import { Caret } from '#ui/lib/caret';
import { fieldSizing } from '#ui/lib/css';
import { CONTENT_LINE, edgeColor, NO_OUTLINE, PLACEHOLDER } from '#ui/lib/field-shell';
import { colors } from '#ui/lib/tokens';
import { useControllable } from '#ui/lib/use-controllable';

/** The browser targets, where the engine does the sizing. */
const WEB = Platform.OS === 'web';

interface TextAreaProps extends Omit<BoxProps, 'children' | 'onChange'> {
  /** Present: you own the state (controlled). Absent: the field runs itself
   *  from `defaultValue` and reports through `onChange`. */
  value?: string;
  defaultValue?: string;
  onChange?: (next: string) => void;
  placeholder?: string;
  /** The floor, in lines: how tall the field opens. */
  rows?: number;
  /** The ceiling, in lines. Past it the entry scrolls rather than growing
   *  further, so one long paragraph cannot push a form's buttons off screen. */
  maxRows?: number;
  /** Grow with the content. On by default; off pins the field at `rows`. */
  autoSize?: boolean;
  /** True when the shell has a real keyboard: renders an editable TextInput.
   *  False (a TV) renders the value plus a blinking caret. */
  physicalKeyboard?: boolean;
  /** Focus on mount so a keyboard user can type immediately. */
  autoFocus?: boolean;
  /** Paint the border red: the field holds a rejected value. Usually set by
   *  <Field error>, the way shadcn couples aria-invalid to FieldError. */
  invalid?: boolean;
  label?: string;
  /** Type of the value and the placeholder. A caller that sets a bigger font
   *  here should set `lineHeight` with it - that is what `rows` counts. */
  textStyle?: StyleProp<TextStyle>;
}

function TextArea({
  value: valueProp,
  defaultValue = '',
  onChange,
  placeholder,
  rows = 3,
  maxRows = 10,
  autoSize = true,
  physicalKeyboard = false,
  autoFocus = false,
  invalid = false,
  label,
  textStyle,
  ...box
}: Readonly<TextAreaProps>) {
  const [value, setValue] = useControllable(valueProp, defaultValue, onChange);
  const [focused, setFocused] = useState(false);
  // What the entry last reported its content to be. Native only: on the web the
  // engine sizes the control and this stays at zero, which is why the height is
  // never handed to a browser (a state write per keystroke, to tell the layout
  // what it already knows).
  const [content, setContent] = useState(0);
  const input = useRef<TextInput>(null);

  const min = lines(rows);
  const max = lines(maxRows);
  const grown = Math.min(Math.max(content, min), max);

  return (
    <Box
      // Top, not centre: a field that grows downwards has to keep its first
      // line where the eye left it.
      align="flex-start"
      px={22}
      radius="2xl"
      borderWidth={1}
      {...box}
      // The WHOLE field is the caret's landing zone, as in <TextField>: a press
      // on the padding must focus the entry rather than demand a hit on the
      // inner control. A drag a surrounding list steals never releases here, so
      // scrolling past the field cannot summon the caret.
      onStartShouldSetResponder={() => physicalKeyboard}
      onResponderRelease={() => input.current?.focus()}
      style={[{ borderColor: edgeColor(focused, invalid) }, box.style]}
    >
      {physicalKeyboard ? (
        <TextInput
          ref={input}
          multiline
          value={value}
          onChangeText={setValue}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          placeholderTextColor={PLACEHOLDER}
          accessibilityLabel={label}
          autoFocus={autoFocus}
          autoCorrect={false}
          autoCapitalize="sentences"
          selectionColor={colors.accent}
          // The native half of the growth. The browser has `field-sizing` for
          // this, and asking for the callback there would cost a state write on
          // every keystroke to reach the same layout.
          onContentSizeChange={
            autoSize && !WEB
              ? (e: TextInputContentSizeChangeEvent) => setContent(e.nativeEvent.contentSize.height)
              : undefined
          }
          style={[
            ENTRY,
            NO_OUTLINE,
            { color: colors.text, minHeight: min, maxHeight: max },
            textStyle,
            growth(autoSize, min, grown),
          ]}
        />
      ) : (
        // The television: a display, not an input. The value wraps and the caret
        // trails it, sitting on the last line rather than mid-block.
        <Box row align="flex-end" gap={2} flex minH={min}>
          <Txt
            lines={maxRows}
            style={[{ flexShrink: 1 }, textStyle]}
            color={value ? 'text' : PLACEHOLDER}
          >
            {value || placeholder || ''}
          </Txt>
          <Caret height={LINE} />
        </Box>
      )}
    </Box>
  );
}

/** Where the entry's height comes from: the browser engine sizes it to its
 * content, native is given the height it measured (already clamped between
 * `rows` and `maxRows`), and a pinned field is simply `rows` tall. */
function growth(autoSize: boolean, min: number, grown: number): StyleProp<TextStyle> {
  if (!autoSize) return { height: min };
  // The escape hatches are typed as ViewStyle, and the two react-native copies
  // the kit is compiled against (the tvOS fork on a TV, mainline on the phone)
  // disagree about whether a ViewStyle is one of these - hence the cast rather
  // than a second helper that returns the same object under another name.
  return WEB ? (fieldSizing() as unknown as TextStyle) : { height: grown };
}

/** One line of the entry, which is the unit `rows` and `maxRows` count in - the
 * very same content row <TextField> uses, which is what makes a one-line
 * TextArea and a TextField the same height. */
const LINE = CONTENT_LINE;
const lines = (n: number) => n * LINE;

const ENTRY = {
  flex: 1,
  width: '100%',
  minWidth: 0,
  borderWidth: 0,
  backgroundColor: 'transparent',
  padding: 0,
  // The line box is PINNED to the kit's own line, which is what makes `rows` and
  // `maxRows` mean exactly what they say: three rows is three lines of text and
  // 72px of field, on every platform, rather than whatever leading the platform
  // font happened to bring.
  lineHeight: LINE,
  // Text starts at the top of the box on Android, where the default is centred.
  textAlignVertical: 'top',
} as const;

export type { TextAreaProps };
export { TextArea };
