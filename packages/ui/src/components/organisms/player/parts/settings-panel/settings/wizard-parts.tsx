import { Pressable } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Icon, type IconName } from '#ui/components/atoms/icon';
import { Text } from '#ui/components/atoms/text';

import { VIRTUAL_FOCUS } from '#ui/components/organisms/player/lib/virtual-focus';
import { styles } from '#ui/core';
import { useT } from '#ui/services/i18n';

/**
 * Presentational atoms for the {@link GenerateWizard}. Focus is state-driven
 * (§15): a `focused` boolean draws the ring, never CSS :hover.
 */

/** A left-value-right cycle field: up/down move between fields, left/right
 * change this one. */
const ARROW_SIZE = 28;

export function CycleField({
  label,
  value,
  focused,
  onFocus,
  onDec,
  onInc,
}: Readonly<{
  label: string;
  value: string;
  focused: boolean;
  onFocus: () => void;
  onDec: () => void;
  onInc: () => void;
}>) {
  const t = useT();
  return (
    <Box onPointerEnter={onFocus} style={[s.cycleRow, focused ? s.cycleOn : s.cycleOff]}>
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
    </Box>
  );
}

// A drawn glyph, not a typed one: `◀` is a character the platform's font may
// not carry, and on a television it landed at whatever weight and baseline that
// font decided.
function CycleArrow({
  icon,
  label,
  dim,
  onPress,
}: Readonly<{ icon: IconName; label: string; dim: boolean; onPress: () => void }>) {
  return (
    <Pressable
      {...VIRTUAL_FOCUS}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Box style={[s.arrow, { opacity: dim ? 0.45 : 1 }]}>
        <Icon name={icon} size={ARROW_SIZE} color="accentText" />
      </Box>
    </Pressable>
  );
}

const s = styles({
  cycleRow: { row: true, align: 'center', between: true, gap: 18, radius: 'lg', px: 22, py: 18 },
  cycleOn: { bg: 'tint/8', ring: 'focusLift', z: 1 },
  cycleOff: { bg: 'tint/4' },
  fieldLabel: { text: 'labelTv', color: 'textMuted' },
  fieldValue: { minW: 180, textAlign: 'center', text: 'strongTv' },
  arrow: { px: 4 },
});
