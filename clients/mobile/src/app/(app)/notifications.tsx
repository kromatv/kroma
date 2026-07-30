// The notification centre on the phone: what happened while you were away,
// styled after the browser's list. The list is live (server push, see
// lib/notifications) and swipe-to-delete, matching Downloads. Approve/Deny
// live on the push notification itself (see lib/notifications/push); this
// list stays a record rather than a console.

import type { Notification, NotificationEvent } from '@kroma/core';
import { groupNotificationsByDay, NOTIFICATION_DAY_LABEL } from '@kroma/core';
import { Icon, IconButton, type IconName } from '@kroma/ui/kit';
import { useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import { FadeImage } from '#mobile/components/FadeImage';
import { PageHeader } from '#mobile/components/PageHeader';
import { EmptyState, Screen } from '#mobile/components/ui';
import { useT } from '#mobile/lib/i18n';
import { boxed, contentWidth } from '#mobile/lib/layout';
import { mobileRoute, useNotifications, useRefreshNotifications } from '#mobile/lib/notifications';
import { useClient } from '#mobile/lib/session';
import { colors, radius, spacing, type } from '#mobile/lib/theme';

export default function NotificationsScreen() {
  const t = useT();
  const client = useClient();
  const refresh = useRefreshNotifications();
  const { data, isPending, isRefetching, refetch } = useNotifications();
  const [busy, setBusy] = useState(false);

  const unread = data?.unread ?? 0;
  const rows = data?.notifications ?? [];
  const sections = useMemo(
    () =>
      groupNotificationsByDay(rows).map((g) => ({
        title: t(NOTIFICATION_DAY_LABEL[g.day]),
        data: g.items,
      })),
    [rows, t],
  );

  async function markAll() {
    setBusy(true);
    try {
      await client.markAllNotificationsRead();
      refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen padded={false}>
      <PageHeader
        title={t('notifications.title')}
        right={
          // A glyph, not the words: PageHeader's trailing slot is a 40pt
          // square and "Mark all as read" was being cut in half inside it.
          unread > 0 ? (
            <IconButton
              variant="ghost"
              size={40}
              glyph={22}
              hitSlop={10}
              disabled={busy}
              label={t('notifications.markAllRead')}
              onPress={() => void markAll()}
            >
              <Icon name="checks" size={22} stroke={2} color={colors.accent} />
            </IconButton>
          ) : null
        }
      />

      {rows.length === 0 && !isPending ? (
        <EmptyState
          icon={<Icon name="bell" size={34} stroke={1.4} color={colors.textDim} />}
          title={t('notifications.empty')}
          hint={t('notifications.emptyHint')}
        />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(n) => n.id}
          contentContainerStyle={styles.list}
          stickySectionHeadersEnabled
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={() => void refetch()}
              tintColor={colors.textDim}
            />
          }
          renderSectionHeader={({ section }) => (
            <Text style={styles.dayLabel}>{section.title}</Text>
          )}
          renderItem={({ item }) => <NotificationRow row={item} />}
        />
      )}
    </Screen>
  );
}

function NotificationRow({ row }: Readonly<{ row: Notification }>) {
  const t = useT();
  const client = useClient();
  const router = useRouter();
  const refresh = useRefreshNotifications();
  const swipe = useRef<SwipeableMethods>(null);

  // Through the client, not raw: art arrives as a server-relative path
  // (`/api/images/…`), which a phone cannot fetch without the server's origin.
  const poster = client.resolveArt(row.imageUrl, 96);
  const route = destinationOf(row);
  const glyph = eventGlyph(row.event);
  const unread = !row.read;

  async function open() {
    if (!row.read) {
      await client.markNotificationsRead([row.id]);
      refresh();
    }
    if (route) router.push(route as never);
  }

  async function remove() {
    await client.deleteNotification(row.id);
    refresh();
  }

  return (
    <ReanimatedSwipeable
      ref={swipe}
      friction={2}
      rightThreshold={40}
      renderRightActions={() => (
        <Pressable
          style={styles.deleteAction}
          onPress={() => {
            swipe.current?.close();
            void remove();
          }}
          accessibilityRole="button"
          accessibilityLabel={t('common.delete')}
        >
          <Icon name="trash" size={20} stroke={2} color="#FFFFFF" />
        </Pressable>
      )}
    >
      <Pressable
        onPress={() => void open()}
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      >
        {/* The gutter is here on every row, empty or not, so nothing shifts. */}
        <View style={styles.gutter}>{unread ? <View style={styles.dot} /> : null}</View>

        {poster ? (
          <FadeImage uri={poster} seed={row.id} radius={radius.md} style={styles.tile} />
        ) : (
          <View style={[styles.tile, styles.tilePlate]}>
            <Icon name={glyph.name} size={20} stroke={1.8} color={glyph.color} />
          </View>
        )}

        <View style={styles.body}>
          <View style={styles.titleRow}>
            <Text numberOfLines={1} style={[styles.title, !unread && styles.titleRead]}>
              {row.title}
            </Text>
            <Text style={styles.time}>{sinceLabel(t, row.createdAt)}</Text>
          </View>
          <Text numberOfLines={2} style={styles.text}>
            {row.body}
          </Text>
        </View>
      </Pressable>
    </ReanimatedSwipeable>
  );
}

// The list draws no buttons, so the notification's own `link` is the
// destination, falling back to its first `link` action. `mobileRoute` returns
// null for screens this app doesn't have, and `api` actions (Approve, Deny)
// are never offered as a destination here.
function destinationOf(row: Notification): string | null {
  const own = mobileRoute(row.link);
  if (own) return own;
  for (const action of row.actions) {
    if (action.kind !== 'link') continue;
    const target = mobileRoute(action.href);
    if (target) return target;
  }
  return null;
}

// The palette's `danger` is a signal red meant for fills; as a 20pt outline on
// a near-black screen it goes muddy, so it's lightened here.
const DANGER_INK = '#F87171';

const EVENT_GLYPH: Record<string, { name: IconName; color: string }> = {
  'request.submitted': { name: 'inbox', color: colors.accent },
  'request.approved': { name: 'circle-check', color: colors.success },
  'request.denied': { name: 'circle-x', color: DANGER_INK },
  'request.available': { name: 'sparkles', color: colors.accent },
  'media.added': { name: 'player-play-filled', color: colors.info },
  'media.episode': { name: 'device-tv', color: colors.info },
  'report.submitted': { name: 'flag-3', color: colors.hdr },
  'report.resolved': { name: 'circle-check', color: colors.success },
  'report.dismissed': { name: 'circle-minus', color: colors.textDim },
  'download.imported': { name: 'download', color: colors.h265 },
  'download.failed': { name: 'alert-triangle', color: DANGER_INK },
  'system.job.failed': { name: 'server-bolt', color: DANGER_INK },
  'system.vpn.down': { name: 'plug-connected-x', color: DANGER_INK },
  'system.disk.low': { name: 'database', color: colors.accent },
  'system.test': { name: 'bell-ringing', color: colors.accent },
  custom: { name: 'sparkles', color: colors.textDim },
};

function eventGlyph(event: NotificationEvent): { name: IconName; color: string } {
  return EVENT_GLYPH[event] ?? { name: 'bell', color: colors.textDim };
}

// Spelled with catalog keys rather than `Intl.RelativeTimeFormat`: Hermes
// ships without full ICU data, so the constructor isn't there on a phone.
function sinceLabel(t: ReturnType<typeof useT>, createdAt: number): string {
  const mins = Math.max(0, Math.round((Date.now() - createdAt) / 60_000));
  if (mins < 1) return t('time.justNow');
  if (mins < 60) return t('time.minutesAgo', { n: mins });
  const hours = Math.round(mins / 60);
  if (hours < 24) return t('time.hoursAgo', { n: hours });
  return t('time.daysAgo', { n: Math.round(hours / 24) });
}

const styles = StyleSheet.create({
  list: {
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.xl,
    ...boxed(contentWidth.reading),
  },
  dayLabel: {
    ...type.small,
    color: colors.textFaint,
    fontWeight: '600',
    // Opaque: it is pinned while its own run scrolls underneath it.
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.md,
    paddingBottom: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 10,
    paddingRight: spacing.sm,
    paddingLeft: 6,
    borderRadius: radius.md,
  },
  // No unread wash: the dot carries it, and a tinted row under every unread
  // notification turns a backlog into one solid block.
  rowPressed: { backgroundColor: colors.surface },
  gutter: { width: 6, height: 48, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent },
  tile: { width: 48, height: 48, borderRadius: radius.md, marginRight: 12 },
  tilePlate: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  body: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  title: { ...type.body, color: colors.text, fontWeight: '700', flex: 1, minWidth: 0 },
  titleRead: { color: colors.textDim },
  time: { ...type.small, color: colors.textFaint, fontWeight: '500', paddingTop: 2 },
  text: { ...type.caption, color: colors.textDim, lineHeight: 18, marginTop: 1 },
  deleteAction: {
    width: 72,
    marginLeft: spacing.xs,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.danger,
  },
});
