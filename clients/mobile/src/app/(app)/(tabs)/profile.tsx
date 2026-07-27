// Account tab, kept deliberately simple: identity (tap to edit), one card of
// destinations (downloads / quick connect / settings), quiet sign-out.
// Everything else lives in dedicated pages.

import { Button, Icon, Txt } from '@kroma/ui/kit';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '#mobile/components/Avatar';
import { formatBytes, useDownloads } from '#mobile/lib/downloads';
import { useT } from '#mobile/lib/i18n';
import { boxed, contentWidth } from '#mobile/lib/layout';
import { useClient, useSession } from '#mobile/lib/session';
import { colors, radius, spacing, TAB_BAR_CLEARANCE, type } from '#mobile/lib/theme';

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
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={styles.rowIconLabel}>
        <View style={styles.rowIconBox}>{icon}</View>
        <Text style={styles.rowLabel}>{label}</Text>
      </View>
      <View style={styles.rowRight}>
        {value ? (
          <Text numberOfLines={1} style={styles.rowValue}>
            {value}
          </Text>
        ) : null}
        <Icon name="chevron-right" size={16} stroke={2.2} color={colors.textFaint} />
      </View>
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
      style={[styles.screen, { paddingLeft: insets.left, paddingRight: insets.right }]}
      contentContainerStyle={[styles.body, { paddingTop: insets.top + spacing.xl }]}
    >
      <Pressable
        onPress={() => router.push('/edit-profile' as never)}
        style={({ pressed }) => [styles.identity, pressed && { opacity: 0.85 }]}
      >
        <View>
          <Avatar uri={avatar} name={user?.username} size={96} />
          <View style={styles.editBadge}>
            <Icon name="pencil" size={13} stroke={1.8} color={colors.accentInk} />
          </View>
        </View>
        <Text style={styles.username}>{user?.username}</Text>
        {user?.email ? <Text style={styles.email}>{user.email}</Text> : null}
      </Pressable>

      <View style={styles.card}>
        <Row
          icon={<Icon name="users" size={19} stroke={2} color={colors.accent} />}
          label={t('nav.changeProfile')}
          onPress={() => switchProfile()}
        />
        <Row
          icon={<Icon name="lock" size={19} stroke={2.2} color={colors.accent} />}
          label={t('account.profileLock')}
          onPress={() => router.push('/profile-pin' as never)}
        />
        <Row
          icon={<Icon name="download" size={19} stroke={2} color={colors.accent} />}
          label={t('offline.downloads')}
          value={downloads.entries.length > 0 ? formatBytes(downloads.totalBytes) : undefined}
          onPress={() => router.push('/downloads' as never)}
        />
        <Row
          icon={<Icon name="device-tv" size={19} stroke={1.8} color={colors.accent} />}
          label={t('connect.title')}
          onPress={() => router.push('/connect-device' as never)}
        />
        <Row
          icon={<Icon name="settings" size={19} stroke={1.8} color={colors.accent} />}
          label={t('nav.settings')}
          onPress={() => router.push('/settings' as never)}
        />
      </View>

      {/* The kit ghost inks text-colored; the danger reading comes via children. */}
      <Button variant="ghost" style={styles.signOut} onPress={() => void signOut()}>
        <Icon name="logout" size={18} stroke={1.8} color="danger" />
        <Txt color="danger" style={styles.signOutText}>
          {t('auth.logout')}
        </Txt>
      </Button>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: {
    padding: spacing.md,
    paddingBottom: TAB_BAR_CLEARANCE,
    gap: spacing.md,
    ...boxed(contentWidth.reading),
  },
  identity: { alignItems: 'center', marginBottom: spacing.md, gap: 3 },
  editBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.bg,
  },
  username: { ...type.heading, marginTop: spacing.sm },
  email: { ...type.caption },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 54,
    paddingHorizontal: spacing.sm,
    gap: spacing.md,
    borderRadius: radius.md,
  },
  rowPressed: { backgroundColor: colors.surfaceRaised },
  rowIconLabel: { flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 1 },
  rowIconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: { ...type.body, fontWeight: '500' },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  rowValue: { ...type.caption, flexShrink: 1 },
  signOut: { marginTop: spacing.sm },
  // No `...type.body` here: the app ramp bakes the default ink, which would
  // sit after Txt's own danger colour and win.
  signOutText: { fontWeight: '700' },
});
