import { BACK_10_ICON, FWD_10_ICON } from '@kromatv/ui';
import {
  Box,
  radius as cornerRadius,
  Icon,
  type IconName,
  styles,
  useStyles,
} from '@kromatv/ui/kit';
import { Pressable } from 'react-native';
import { useT } from '#mobile/lib/i18n';
import { spacing } from '#mobile/lib/theme';

const SKIP_MS = 10_000;

export function RemoteTransport({
  isPlaying,
  buffering,
  onSkip,
  onTogglePlay,
}: Readonly<{
  isPlaying: boolean;
  buffering: boolean;
  onSkip(deltaMs: number): void;
  onTogglePlay(): void;
}>) {
  const s = useStyles(sDefinition);

  const t = useT();
  return (
    <Box style={s.transport}>
      <Round icon={BACK_10_ICON} label={t('player.back10')} onPress={() => onSkip(-SKIP_MS)} />
      <Round
        big
        icon={isPlaying || buffering ? 'player-pause-filled' : 'player-play-filled'}
        label={t(isPlaying ? 'player.pause' : 'player.play')}
        onPress={onTogglePlay}
      />
      <Round icon={FWD_10_ICON} label={t('player.fwd10')} onPress={() => onSkip(SKIP_MS)} />
    </Box>
  );
}

function Round({
  icon,
  label,
  onPress,
  big,
}: Readonly<{ icon: IconName; label: string; onPress(): void; big?: boolean }>) {
  const s = useStyles(sDefinition);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [s.round, big && s.roundBig, pressed && { opacity: 0.7 }]}
    >
      <Icon name={icon} size={big ? 34 : 26} thickness={1.8} color="text" />
    </Pressable>
  );
}

const sDefinition = styles({
  transport: { row: true, center: true, gap: spacing.lg, py: spacing.sm },
  round: { center: true, w: 56, h: 56, bg: 'surface2', radius: cornerRadius.mobileHero },
  roundBig: { w: 76, h: 76, bg: 'surface3', radius: cornerRadius.transport },
});
