import { Pressable } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Txt } from '#ui/components/atoms/text';
import { FOCUS_SHADOW_SM } from '#ui/components/organisms/player/lib/style';
import { VIRTUAL_FOCUS } from '#ui/components/organisms/player/lib/virtual-focus';
import { fonts } from '#ui/lib/tokens';

/**
 * Presentational atoms for the {@link GenerateWizard}. Focus is state-driven
 * (§15): a `focused` boolean draws the ring, never CSS :hover.
 */

const CYCLE_ROW = {
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  justifyContent: 'space-between' as const,
  gap: 18,
  borderRadius: 14,
  paddingHorizontal: 22,
  paddingVertical: 18,
};

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
    <Box
      onPointerEnter={onFocus}
      style={[
        CYCLE_ROW,
        focused
          ? { backgroundColor: 'rgba(255, 255, 255, 0.08)', boxShadow: FOCUS_SHADOW_SM }
          : { backgroundColor: 'rgba(255, 255, 255, 0.04)' },
      ]}
    >
      <Txt style={FIELD_LABEL}>{label}</Txt>
      <Box row align="center" gap={16}>
        <CycleArrow glyph="◀" label="prev" dim={!focused} onPress={onDec} />
        <Txt style={FIELD_VALUE}>{value}</Txt>
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
        color="accent"
      >
        {glyph}
      </Txt>
    </Pressable>
  );
}

const FIELD_LABEL = {
  fontFamily: fonts.ui,
  fontWeight: '600' as const,
  fontSize: 17,
  color: 'rgba(244, 243, 240, 0.62)',
};

const FIELD_VALUE = {
  minWidth: 180,
  textAlign: 'center' as const,
  fontFamily: fonts.ui,
  fontWeight: '700' as const,
  fontSize: 19,
};
