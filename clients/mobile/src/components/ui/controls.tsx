// The text entry. Buttons and chips are the kit's own (@kroma/ui/kit).

import { Icon, type IconName } from '@kroma/ui/kit';
import {
  type StyleProp,
  StyleSheet,
  TextInput,
  type TextInputProps,
  View,
  type ViewStyle,
} from 'react-native';
import { colors, radius, spacing } from '#mobile/lib/theme';

/** The entry, with the design system's fixed glyph well: every field carries a
 * leading icon naming what it holds, and the well is a constant size so a field
 * with an icon is never taller than its neighbours (the kit TextField's rule).
 * `icon` is a KIT icon name - the same shared Tabler set every surface draws
 * from - and `style` lands on the WELL, so call sites keep sizing the box they
 * always did. */
export function TextField({
  icon,
  style,
  multiline,
  ...props
}: Readonly<Omit<TextInputProps, 'style'> & { icon?: IconName; style?: StyleProp<ViewStyle> }>) {
  return (
    <View style={[styles.inputWell, multiline && styles.inputWellMultiline, style]}>
      {icon ? (
        <View style={[styles.inputIcon, multiline && styles.inputIconMultiline]}>
          <Icon name={icon} size={18} stroke={1.8} color={colors.textFaint} />
        </View>
      ) : null}
      <TextInput
        placeholderTextColor={colors.textFaint}
        autoCapitalize="none"
        autoCorrect={false}
        multiline={multiline}
        {...props}
        style={styles.inputInner}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  inputWell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
  },
  /** A growing entry reads from its first line, so its glyph pins to the top. */
  inputWellMultiline: { alignItems: 'flex-start', paddingVertical: 12 },
  inputIcon: { width: 20, alignItems: 'center' },
  inputIconMultiline: { paddingTop: 2 },
  inputInner: {
    flex: 1,
    minWidth: 0,
    color: colors.text,
    fontSize: 15,
    paddingVertical: 0,
  },
});
