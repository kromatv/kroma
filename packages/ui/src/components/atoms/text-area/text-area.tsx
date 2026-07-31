// <TextArea>: the multi-line entry. A real TextInput where there is a physical
// keyboard, a non-focusable display plus caret on a television.

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
import { styles, useTheme } from '#ui/core';
import { Caret } from '#ui/lib/caret';
import { fieldSizing } from '#ui/lib/css';
import { CONTENT_LINE, edgeColor, fieldRing, NO_OUTLINE, PLACEHOLDER } from '#ui/lib/field-shell';
import { useControllable } from '#ui/lib/use-controllable';

const WEB = Platform.OS === 'web';

interface TextAreaProps extends Omit<BoxProps, 'children' | 'onChange' | 'ring'> {
  value?: string;
  defaultValue?: string;
  onChange?: (next: string) => void;
  placeholder?: string;
  rows?: number;
  maxRows?: number;
  autoSize?: boolean;
  physicalKeyboard?: boolean;
  autoFocus?: boolean;
  invalid?: boolean;
  label?: string;
  /** A caller setting a bigger font here should set `lineHeight` with it: that
   *  is what `rows` counts. */
  textStyle?: StyleProp<TextStyle>;
  /** The amber focus ring. Off for an entry flattened into other chrome, where
   *  the surrounding sheet is the focus surface. */
  ring?: boolean;
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
  ring = true,
  ...box
}: Readonly<TextAreaProps>) {
  const theme = useTheme();
  const [value, setValue] = useControllable(valueProp, defaultValue, onChange);
  const [focused, setFocused] = useState(false);
  const [content, setContent] = useState(0);
  const input = useRef<TextInput>(null);

  const min = lines(rows);
  const max = lines(maxRows);
  const grown = Math.min(Math.max(content, min), max);

  return (
    <Box
      // Top, not centre: a field that grows downwards keeps its first line put.
      align="flex-start"
      px={22}
      radius="2xl"
      borderWidth={1}
      {...box}
      // The whole field is the caret's landing zone, padding included. A drag a
      // surrounding list steals never releases here, so scrolling past the field
      // cannot summon the caret.
      onStartShouldSetResponder={() => physicalKeyboard}
      onResponderRelease={() => input.current?.focus()}
      style={[
        { borderColor: edgeColor(focused, invalid) },
        focused && ring ? fieldRing() : null,
        box.style,
      ]}
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
          selectionColor={theme.colors.accent}
          // Native only: the browser has `field-sizing`, and the callback there
          // would cost a state write per keystroke for the same layout.
          onContentSizeChange={
            autoSize && !WEB
              ? (e: TextInputContentSizeChangeEvent) => setContent(e.nativeEvent.contentSize.height)
              : undefined
          }
          style={[
            s.entry,
            NO_OUTLINE,
            { color: theme.colors.text, minHeight: min, maxHeight: max },
            textStyle,
            growth(autoSize, min, grown),
          ]}
        />
      ) : (
        // A television: a display, not an input, so no tap can summon the IME.
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

function growth(autoSize: boolean, min: number, grown: number): StyleProp<TextStyle> {
  if (!autoSize) return { height: min };
  // The two react-native copies the kit compiles against (the tvOS fork, then
  // mainline) disagree about whether a ViewStyle is a TextStyle: hence the cast.
  return WEB ? (fieldSizing() as unknown as TextStyle) : { height: grown };
}

const LINE = CONTENT_LINE;
const lines = (n: number) => n * LINE;

const s = styles({
  entry: {
    flex: true,
    w: '100%',
    minW: 0,
    borderWidth: 0,
    bg: 'transparent',
    p: 0,
    // Pinned to the kit's line so `rows` means the same height on every platform,
    // not whatever leading the platform font brought.
    lineHeight: LINE,
    // Text starts at the top of the box on Android, where the default is centred.
    textAlignVertical: 'top',
  },
});

export type { TextAreaProps };
export { TextArea };
