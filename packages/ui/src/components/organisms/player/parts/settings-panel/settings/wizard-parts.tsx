import { Pressable } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Text } from '#ui/components/atoms/text';

import { VIRTUAL_FOCUS } from '#ui/components/organisms/player/lib/virtual-focus';
import { styles } from '#ui/core';

/**
 * Presentational atoms for the {@link GenerateWizard}. Focus is state-driven
 * (§15): a `focused` boolean draws the ring, never CSS :hover.
 */

/** A ◀ value ▶ cycle field: ▲▼ move between fields, ◀▶ change this one. */
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
  return (
    <Box onPointerEnter={onFocus} style={[s.cycleRow, focused ? s.cycleOn : s.cycleOff]}>
      <Text style={s.fieldLabel}>{label}</Text>
      <Box row align="center" gap={16}>
        <CycleArrow glyph="◀" label="prev" dim={!focused} onPress={onDec} />
        <Text style={s.fieldValue}>{value}</Text>
        <CycleArrow glyph="▶" label="next" dim={!focused} onPress={onInc} />
      </Box>
    </Box>
  );
}

function CycleArrow({
  glyph,
  label,
  dim,
  onPress,
}: Readonly<{ glyph: string; label: string; dim: boolean; onPress: () => void }>) {
  return (
    <Pressable
      {...VIRTUAL_FOCUS}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={[s.arrow, { opacity: dim ? 0.45 : 1 }]} color="accentText">
        {glyph}
      </Text>
    </Pressable>
  );
}

const s = styles({
  cycleRow: { row: true, align: 'center', between: true, gap: 18, radius: 'lg', px: 22, py: 18 },
  cycleOn: { bg: 'tint/8', ring: 'focusLift', z: 1 },
  cycleOff: { bg: 'tint/4' },
  fieldLabel: { text: 'labelTv', color: 'textMuted' },
  fieldValue: { minW: 180, textAlign: 'center', text: 'strongTv' },
  arrow: { px: 4, text: 'strongTv' },
});
