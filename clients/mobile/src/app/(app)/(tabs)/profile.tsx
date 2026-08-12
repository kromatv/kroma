// Account tab: identity, one card of destination rows, sign-out. Everything
// else lives in dedicated pages.

import { Box, Button, Icon, styles, Text } from '@kroma/ui/kit';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '#mobile/components/Avatar';
import { formatBytes, useDownloads } from '#mobile/lib/downloads';
import { useT } from '#mobile/lib/i18n';
import { boxed, contentWidth } from '#mobile/lib/layout';
import { useClient, useSession } from '#mobile/lib/session';
import { radius, spacing, TAB_BAR_CLEARANCE, type } from '#mobile/lib/theme';

function Row({
  icon,
  label,
  value,
  onPress,
}: Readonly<{
  icon: React.ReactNode;
  label: string;
  value?: string;
  onPress(): void;
}>) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.row, pressed && s.rowPressed]}>
      <Box style={s.rowIconLabel}>
        <Box style={s.rowIconBox}>{icon}</Box>
        <Text style={s.rowLabel}>{label}</Text>
      </Box>
      <Box style={s.rowRight}>
        {value ? (
          <Text lines={1} style={s.rowValue}>
            {value}
          </Text>
        ) : null}
        <Icon name="chevron-right" size={16} thickness={2.2} color="textDim" />
      </Box>
    </Pressable>
  );
}

export default function Profile() {
  const t = useT();
  const router = useRouter();
  const { user, signOut, switchProfile } = useSession();
  const client = useClient();
  const downloads = useDownloads();
  const insets = useSafeAreaInsets();
  const avatar = client.resolveArt(user?.avatarUrl);

  return (
    <ScrollView
      // Horizontal insets on the frame keep the centered column clear of the
      // landscape notch; the body's own padding stays the visual gutter.
      style={[s.screen, { paddingLeft: insets.left, paddingRight: insets.right }]}
      contentContainerStyle={[s.body, { paddingTop: insets.top + spacing.xl }]}
    >
      <Pressable
        onPress={() => router.push('/edit-profile' as never)}
        style={({ pressed }) => [s.identity, pressed && { opacity: 0.85 }]}
      >
        <Box>
          <Avatar uri={avatar} name={user?.username} size={96} />
          <Box style={s.editBadge}>
            <Icon name="pencil" size={13} thickness={1.8} color="accentInk" />
          </Box>
        </Box>
        <Text style={s.username}>{user?.username}</Text>
        {user?.email ? <Text style={s.email}>{user.email}</Text> : null}
      </Pressable>

      <Box style={s.card}>
        <Row
          icon={<Icon name="users" size={19} thickness={2} color="accentText" />}
          label={t('nav.changeProfile')}
          onPress={() => switchProfile()}
        />
        <Row
          icon={<Icon name="lock" size={19} thickness={2.2} color="accentText" />}
          label={t('account.profileLock')}
          onPress={() => router.push('/profile-pin' as never)}
        />
        <Row
          icon={<Icon name="download" size={19} thickness={2} color="accentText" />}
          label={t('offline.downloads')}
          value={downloads.entries.length > 0 ? formatBytes(downloads.totalBytes) : undefined}
          onPress={() => router.push('/downloads' as never)}
        />
        <Row
          icon={<Icon name="device-tv" size={19} thickness={1.8} color="accentText" />}
          label={t('connect.title')}
          onPress={() => router.push('/connect-device' as never)}
        />
        <Row
          icon={<Icon name="settings" size={19} thickness={1.8} color="accentText" />}
          label={t('nav.settings')}
          onPress={() => router.push('/settings' as never)}
        />
      </Box>

      {/* The kit ghost inks text-colored; the danger reading comes via children. */}
      <Button variant="ghost" style={s.signOut} onPress={() => void signOut()}>
        <Icon name="logout" size={18} thickness={1.8} color="danger" />
        <Text color="danger" style={s.signOutText}>
          {t('auth.logout')}
        </Text>
      </Button>
    </ScrollView>
  );
}

const s = styles({
  screen: { flex: true, bg: 'bg' },
  body: { gap: spacing.md, p: spacing.md, pb: TAB_BAR_CLEARANCE, ...boxed(contentWidth.reading) },
  identity: { align: 'center', gap: 3, mb: spacing.md },
  editBadge: {
    absolute: true,
    right: -2,
    bottom: -2,
    center: true,
    w: 28,
    h: 28,
    bg: 'accent',
    radius: 14,
    border: 'bg',
    borderWidth: 3,
  },
  username: { ...type.heading, mt: spacing.sm },
  email: { ...type.caption },
  card: { px: 6, py: 4, bg: 'surface1', radius: radius.lg },
  row: {
    row: true,
    between: true,
    align: 'center',
    gap: spacing.md,
    minH: 54,
    px: spacing.sm,
    radius: radius.md,
  },
  rowPressed: { bg: 'surface2' },
  rowIconLabel: { row: true, align: 'center', shrink: 1, gap: 12 },
  rowIconBox: { center: true, w: 34, h: 34, bg: 'accentSoft', radius: 10 },
  rowLabel: { ...type.body, fontWeight: '500' },
  rowRight: { row: true, align: 'center', shrink: 1, gap: 8 },
  rowValue: { ...type.caption, shrink: 1 },
  signOut: { mt: spacing.sm },
  // No `...type.body` here: the app ramp bakes the default ink, which would
  // sit after Text's own danger colour and win.
  signOutText: { fontWeight: '700' },
});
