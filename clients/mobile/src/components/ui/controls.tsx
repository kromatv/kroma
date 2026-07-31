// The text entry. Buttons and chips are the kit's own (@kroma/ui/kit).

import { Icon, type IconName, styles } from '@kroma/ui/kit';
import { type StyleProp, TextInput, type TextInputProps, View, type ViewStyle } from 'react-native';
import { colors, radius, spacing } from '#mobile/lib/theme';

/** `style` lands on the icon well, not the inner `TextInput`, so call sites
 * keep sizing the box they always did. */
export function TextField({
  icon,
  style,
  multiline,
  ...props
}: Readonly<Omit<TextInputProps, 'style'> & { icon?: IconName; style?: StyleProp<ViewStyle> }>) {
  return (
    <View style={[s.inputWell, multiline && s.inputWellMultiline, style]}>
      {icon ? (
        <View style={[s.inputIcon, multiline && s.inputIconMultiline]}>
          <Icon name={icon} size={18} stroke={1.8} color={colors.textFaint} />
        </View>
      ) : null}
      <TextInput
        placeholderTextColor={colors.textFaint}
        autoCapitalize="none"
        autoCorrect={false}
        multiline={multiline}
        {...props}
        style={s.inputInner}
      />
    </View>
  );
}

const s = styles({
  inputWell: {
    row: true,
    align: 'center',
    gap: 10,
    minH: 48,
    px: spacing.md,
    bg: 'surface1',
    radius: radius.md,
    border: 'border',
  },
  // A growing entry reads from its first line, so its glyph pins to the top.
  inputWellMultiline: { align: 'flex-start', py: 12 },
  inputIcon: { align: 'center', w: 20 },
  inputIconMultiline: { pt: 2 },
  inputInner: { flex: true, minW: 0, py: 0, color: 'text', fontSize: 15 },
});
