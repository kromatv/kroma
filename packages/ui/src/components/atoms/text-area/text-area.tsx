import {
  activeTheme,
  color,
  type StyleScope,
  sharedStyle,
  style,
  styles,
  useStyleScope,
  useTheme,
} from '#ui/core';

// <TextArea>: the multi-line entry. A real TextInput where there is a physical
// keyboard, a non-focusable display plus caret on a television.

import { useRef, useState } from 'react';
import { type StyleProp, TextInput, type TextStyle } from 'react-native';
import { Box, type BoxProps } from '#ui/components/atoms/box';
import { Text } from '#ui/components/atoms/text';

import { useStyles } from '#ui/core/styles';
import { Caret } from '#ui/lib/caret';
import { useContentHeight } from '#ui/lib/content-height';
import {
  CONTROL,
  type ControlSize,
  fieldShell,
  NO_OUTLINE,
  PLACEHOLDER,
  useControlMetrics,
  useEntryDefaults,
  useEntryFontSize,
} from '#ui/lib/field-shell';
import { useControllable } from '#ui/lib/use-controllable';

interface TextAreaProps extends Omit<BoxProps, 'children' | 'ring'> {
  value?: string;
  defaultValue?: string;
  onValueChange?: (next: string) => void;
  /** After the entry takes focus; see <TextField>. */
  onFocus?: () => void;
  /** After the entry loses focus: the commit point of a save-on-blur field. */
  onBlur?: () => void;
  placeholder?: string;
  rows?: number;
  maxRows?: number;
  autoSize?: boolean;
  physicalKeyboard?: boolean;
  autoFocus?: boolean;
  invalid?: boolean;
  label?: string;
  /** The control shell's size; see <TextField>. */
  size?: ControlSize;
  /** A caller setting a bigger font here should set `lineHeight` with it: that
   *  is what `rows` counts. */
  textStyle?: StyleProp<TextStyle>;
  /** The shell belongs to something else - the well of an <InputGroup>. See
   *  `fieldShell` for what that drops and why. */
  flat?: boolean;
}

const SHRINK = style({ flexShrink: 1 });

const entryOf = (
  minHeight: number,
  maxHeight: number | undefined,
  fontSize: number,
  scope: StyleScope,
) =>
  sharedStyle(
    `text-area:entry:${minHeight}:${maxHeight}:${fontSize}`,
    {
      color: 'text',
      minHeight,
      maxHeight,
      fontSize,
    },
    scope,
  );
function TextArea({
  value: valueProp,
  defaultValue = '',
  onValueChange,
  onFocus,
  onBlur,
  placeholder,
  rows = 3,
  maxRows = 10,
  autoSize = true,
  physicalKeyboard: askedPhysicalKeyboard,
  autoFocus = false,
  invalid = false,
  label,
  size,
  textStyle,
  flat = false,
  ...box
}: Readonly<TextAreaProps>) {
  const scope = useStyleScope();

  const s = useStyles(sDefinition);

  const entryDefaults = useEntryDefaults();
  const physicalKeyboard = askedPhysicalKeyboard ?? entryDefaults.physicalKeyboard;
  const metrics = useControlMetrics(size);
  const fontSize = useEntryFontSize(metrics.fontSize);
  const theme = useTheme();
  const [value, setValue] = useControllable(valueProp, defaultValue, onValueChange);
  const [focused, setFocused] = useState(false);
  const input = useRef<TextInput>(null);

  const min = lines(rows);
  const max = lines(maxRows);
  const height = useContentHeight(min, max);
  const shell = fieldShell(metrics, { flat, focused, invalid }, scope);

  return (
    <Box
      // Top, not centre: a field that grows downwards keeps its first line put.
      align="flex-start"
      px={metrics.px}
      py={metrics.py}
      {...shell.box}
      {...box}
      // The whole field is the caret's landing zone, padding included. A drag a
      // surrounding list steals never releases here, so scrolling past the field
      // cannot summon the caret.
      onStartShouldSetResponder={() => physicalKeyboard}
      onResponderRelease={() => input.current?.focus()}
      style={[shell.edge, box.style]}
    >
      {physicalKeyboard ? (
        <TextInput
          ref={input}
          multiline
          value={value}
          onChangeText={setValue}
          onFocus={() => {
            setFocused(true);
            onFocus?.();
          }}
          onBlur={() => {
            setFocused(false);
            onBlur?.();
          }}
          placeholder={placeholder}
          placeholderTextColor={color(PLACEHOLDER, activeTheme(scope.theme))}
          accessibilityLabel={label}
          autoFocus={autoFocus}
          autoCorrect={false}
          autoCapitalize="sentences"
          selectionColor={theme.colors.accent}
          onContentSizeChange={autoSize ? height.onContentSizeChange : undefined}
          style={[
            s.entry,
            NO_OUTLINE,
            entryOf(min, max, fontSize, scope),
            textStyle,
            growth(autoSize, min, height.style, scope),
          ]}
        />
      ) : (
        // A television: a display, not an input, so no tap can summon the IME.
        <Box row align="flex-end" gap={2} flex minH={min}>
          <Text lines={maxRows} style={[SHRINK, textStyle]} color={value ? 'text' : PLACEHOLDER}>
            {value || placeholder || ''}
          </Text>
          <Caret height={LINE} />
        </Box>
      )}
    </Box>
  );
}

function growth(
  autoSize: boolean,
  min: number,
  sized: StyleProp<TextStyle>,
  scope: StyleScope,
): StyleProp<TextStyle> {
  if (!autoSize) return sharedStyle(`text-area:height:${min}`, { height: min }, scope);
  return sized;
}

// The row unit `rows`/`maxRows` count in: the md shell's content line, so a
// one-line TextArea is exactly a TextField tall on either size.
const LINE = CONTROL.md.line;
const lines = (n: number) => n * LINE;

const sDefinition = styles({
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
