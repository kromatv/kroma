import { Pressable } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Txt } from '#ui/components/atoms/text';

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
      <Txt style={s.fieldLabel}>{label}</Txt>
      <Box row align="center" gap={16}>
        <CycleArrow glyph="◀" label="prev" dim={!focused} onPress={onDec} />
        <Txt style={s.fieldValue}>{value}</Txt>
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
      <Txt
        style={{ fontSize: 20, lineHeight: 22, paddingHorizontal: 4, opacity: dim ? 0.45 : 1 }}
        color="accentText"
      >
        {glyph}
      </Txt>
    </Pressable>
  );
}

const s = styles({
  cycleRow: { row: true, align: 'center', between: true, gap: 18, radius: 'lg', px: 22, py: 18 },
  cycleOn: { bg: 'tint/8', ring: 'focusLift', z: 1 },
  cycleOff: { bg: 'tint/4' },
  fieldLabel: { font: 'ui', fontWeight: '600', fontSize: 17, color: 'textMuted' },
  fieldValue: {
    minW: 180,
    textAlign: 'center',
    font: 'ui',
    fontWeight: '700',
    fontSize: 19,
  },
});
