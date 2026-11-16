import {
  Box,
  radius as cornerRadius,
  Icon,
  IconButton,
  styles,
  Text,
  fontSizes as textSizes,
  useStyles,
} from '@kromatv/ui/kit';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CastIconButton } from '#mobile/components/cast/cast-icon-button.component';
import { KromaLockup } from '#mobile/components/kroma-lockup.component';
import { NotificationBell } from '#mobile/components/notification-bell.component';
import { ProgressRing } from '#mobile/components/progress-ring.component';
import { useDownloads } from '#mobile/lib/downloads';
import { useGutters } from '#mobile/lib/layout';
import { spacing } from '#mobile/lib/theme';

function DownloadsGlyph() {
  const s = useStyles(sDefinition);

  const downloads = useDownloads();
  const pending = downloads.downloading.length + downloads.queuedItems.length;
  if (pending === 0) {
    return <Icon name="download" size={22} thickness={2} />;
  }
  const progress = downloads.downloading[0]?.progress ?? -1;
  return (
    <Box style={s.dlGlyph}>
      <ProgressRing progress={progress} size={26} thickness={2.5} />
      {progress >= 0 ? (
        <Box pointerEvents="none" style={s.dlArrow}>
          <Icon name="download" size={12} thickness={2.6} />
        </Box>
      ) : null}
      {pending > 1 ? (
        <Box style={s.dlCount}>
          <Text style={s.dlCountText}>{pending}</Text>
        </Box>
      ) : null}
    </Box>
  );
}

export function HomeHeader() {
  const s = useStyles(sDefinition);

  const router = useRouter();
  const insets = useSafeAreaInsets();
  const gutters = useGutters();
  return (
    <Box style={[s.header, { paddingTop: insets.top + spacing.sm }, gutters.style]}>
      <Box style={s.brandRow}>
        <KromaLockup height={20} />
      </Box>
      <Box style={s.headerActions}>
        <CastIconButton />
        <IconButton
          variant="ghost"
          diameter={40}
          glyph={22}
          hitSlop={10}
          onPress={() => router.push('/downloads')}
        >
          <DownloadsGlyph />
        </IconButton>
        <NotificationBell />
      </Box>
    </Box>
  );
}

const sDefinition = styles({
  header: { row: true, between: true, align: 'center', pt: spacing.sm },
  brandRow: { row: true, align: 'center' },
  // The buttons carry their own 40pt targets, so this gap spaces glyphs, not
  // touch areas.
  headerActions: { row: true, align: 'center', gap: 6 },
  dlGlyph: { center: true, w: 26, h: 26 },
  dlArrow: { absolute: true, top: 0, right: 0, bottom: 0, left: 0, center: true },
  dlCount: {
    absolute: true,
    top: -5,
    right: -8,
    center: true,
    h: 15,
    minW: 15,
    px: 3,
    bg: 'accent',
    radius: cornerRadius.sm,
  },
  dlCountText: { color: 'accentInk', fontSize: textSizes.micro, fontWeight: '700' },
});
