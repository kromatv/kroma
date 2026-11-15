// The controls themselves: scrims, title bar, transport row and the scrub bar
// with its actions. Mounted only while controls are up; every press pokes the
// auto-hide timer, and a finger on the controls or a scrub in flight holds it off.
//
// The design mirrors the TV player's (@kromatv/ui player parts) at phone scale;
// the UX stays the phone's own, which is why this file mirrors those parts
// rather than importing them.

import {
  BackButton,
  Box,
  fonts,
  IconButton,
  type IconName,
  SHADE,
  shade,
  styles,
  Text,
  typeSpec as textRoles,
  fontSizes as textSizes,
  useStyles,
} from '@kromatv/ui/kit';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import type { EdgeInsets } from 'react-native-safe-area-context';
import { useT } from '#mobile/lib/i18n';
import { spacing } from '#mobile/lib/theme';
import { useControlsHold } from '#mobile/player/chrome/useControlsHold';
import type { Transport } from '#mobile/player/engine';
import type { StoryboardTile } from '#mobile/player/useStoryboard';
import { PlayerScrubRow } from './scrub-row';
import { TransportControls } from './transport-controls';

/** The full-screen controls every phone player shares. `start` and `end` are
 * the two groups of shortcuts under the scrub bar. */
export function ControlsFrame({
  engine,
  title,
  subtitle,
  markers,
  tileFor,
  insets,
  poke,
  hold,
  onBack,
  onBarLayout,
  start,
  end,
}: Readonly<{
  engine: Transport;
  title: string;
  subtitle?: string;
  markers?: number[];
  tileFor?: (abs: number) => StoryboardTile | null;
  insets: EdgeInsets;
  poke(): void;
  hold?(): () => void;
  onBack(): void;
  onBarLayout(height: number): void;
  start?: ReactNode;
  end?: ReactNode;
}>) {
  const s = useStyles(sDefinition);

  const t = useT();
  const touch = useControlsHold(hold);

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="box-none"
      onTouchStart={touch.take}
      onTouchEnd={(e) => {
        if (e.nativeEvent.touches.length === 0) touch.give();
      }}
      onTouchCancel={touch.give}
    >
      <Box style={s.scrim} pointerEvents="none" />
      <LinearGradient
        colors={[shade(0.65), SHADE.transparent]}
        style={s.scrimTop}
        pointerEvents="none"
      />
      <LinearGradient
        colors={[SHADE.transparent, shade(0.85)]}
        style={s.scrimBottom}
        pointerEvents="none"
      />
      <Box
        style={[
          s.topBar,
          {
            paddingTop: insets.top + 6,
            paddingLeft: Math.max(insets.left, spacing.md),
            paddingRight: Math.max(insets.right, spacing.md),
          },
        ]}
        pointerEvents="box-none"
      >
        <BackButton diameter={42} onPress={onBack} label={t('common.back')} />
        {/* Beside the back button, like the TV bar: the title reads from the
            corner, not the centre of the picture. */}
        <Box style={s.titleBox}>
          <Text lines={1} style={s.title}>
            {title}
          </Text>
          {subtitle ? (
            <Text lines={1} style={s.subtitle}>
              {subtitle}
            </Text>
          ) : null}
        </Box>
      </Box>

      <TransportControls engine={engine} poke={poke} compact={false} />

      <Box
        style={[
          s.bottomBar,
          {
            paddingBottom: Math.max(insets.bottom, 12),
            paddingLeft: Math.max(insets.left, spacing.md),
            paddingRight: Math.max(insets.right, spacing.md),
          },
        ]}
        onLayout={(e) => onBarLayout(Math.round(e.nativeEvent.layout.height))}
      >
        <PlayerScrubRow
          engine={engine}
          onInteract={poke}
          hold={hold}
          tileFor={tileFor}
          markers={markers}
        />
        {/* Icon-only: labels ride on accessibility, not the row itself. */}
        <Box style={s.actionsRow}>
          <Box style={s.actionsGroup}>{start}</Box>
          <Box style={s.actionsGroup}>{end}</Box>
        </Box>
      </Box>
    </View>
  );
}

export function RowShortcut({
  icon,
  label,
  onPress,
}: Readonly<{ icon: IconName; label: string; onPress(): void }>) {
  return <IconButton diameter={40} icon={icon} glyph={20} onPress={onPress} label={label} />;
}

const sDefinition = styles({
  scrim: { fill: true, bg: 'bg/22' },
  scrimTop: { absolute: true, top: 0, right: 0, left: 0, h: 120 },
  scrimBottom: { absolute: true, right: 0, bottom: 0, left: 0, h: 160 },
  topBar: { row: true, align: 'center', gap: 12 },
  titleBox: { flex: true, minW: 0 },
  title: {
    fontFamily: fonts.display,
    color: 'white',
    fontSize: textRoles.cardTitle.size,
    fontWeight: '700',
  },
  subtitle: { mt: 1, color: 'text/60', fontSize: textSizes.caption, fontWeight: '500' },
  bottomBar: { px: spacing.md },
  actionsRow: { row: true, between: true, align: 'center', mt: 10 },
  actionsGroup: { row: true, align: 'center', gap: 12 },
});
