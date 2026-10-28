import { Pressable } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Focusable } from '#ui/components/atoms/focusable';
import { Icon, type IconName } from '#ui/components/atoms/icon';
import { Text } from '#ui/components/atoms/text';
import { VIRTUAL_FOCUS } from '#ui/lib/player/virtual-focus';
import { styles } from '#ui/core';
import { useStyles } from '#ui/core/styles';
import { useT } from '#ui/services/i18n';

/** Presentational atoms for the {@link GenerateWizard}. */

/** A left-value-right cycle field: up/down move between fields, left/right
 * change this one. */
const ARROW_SIZE = 28;

export function CycleField({
  label,
  value,
  onDec,
  onInc,
}: Readonly<{
  label: string;
  value: string;
  onDec: () => void;
  onInc: () => void;
}>) {
  const s = useStyles(sDefinition);

  const t = useT();
  return (
    <Focusable
      // oxlint-disable-next-line jsx-a11y/aria-role -- React Native's vocabulary, not ARIA's - react-native-web renders `adjustable` as the ARIA `slider`.
      role="adjustable"
      label={`${label}: ${value}`}
      onKey={(direction) => {
        if (direction === 'left') onDec();
        else if (direction === 'right') onInc();
        else return false;
        return true;
      }}
      states={CYCLE_FOCUS}
      style={[s.cycleRow, s.cycleOff]}
    >
      {({ focused }) => (
        <>
          <Text style={s.fieldLabel}>{label}</Text>
          <Box row align="center" gap={16}>
            <CycleArrow
              icon="chevron-left"
              label={`${t('common.decrease')} ${label}`}
              dim={!focused}
              onPress={onDec}
            />
            <Text style={s.fieldValue}>{value}</Text>
            <CycleArrow
              icon="chevron-right"
              label={`${t('common.increase')} ${label}`}
              dim={!focused}
              onPress={onInc}
            />
          </Box>
        </>
      )}
    </Focusable>
  );
}

const CYCLE_FOCUS = { focus: { bg: 'tint/8' } } as const;

// A drawn glyph, not a typed one: `◀` is a character the platform's font may
// not carry, and on a television it landed at whatever weight and baseline that
// font decided.
function CycleArrow({
  icon,
  label,
  dim,
  onPress,
}: Readonly<{ icon: IconName; label: string; dim: boolean; onPress: () => void }>) {
  const s = useStyles(sDefinition);

  return (
    <Pressable
      {...VIRTUAL_FOCUS}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Box style={[s.arrow, dim ? s.dim : s.full]}>
        <Icon name={icon} size={ARROW_SIZE} color="accentText" />
      </Box>
    </Pressable>
  );
}

const sDefinition = styles({
  dim: { opacity: 0.45 },
  full: { opacity: 1 },
  cycleRow: { row: true, align: 'center', between: true, gap: 18, radius: 'xl', px: 22, py: 18 },
  cycleOff: { bg: 'tint/4' },
  fieldLabel: { text: 'labelTv', color: 'textMuted' },
  fieldValue: { minW: 180, textAlign: 'center', text: 'strongTv' },
  arrow: { px: 4 },
});
