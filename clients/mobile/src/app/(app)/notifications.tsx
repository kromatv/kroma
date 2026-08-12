// The notification centre on the phone: what happened while you were away,
// styled after the browser's list. The list is live (server push, see
// lib/notifications) and swipe-to-delete, matching Downloads. Approve/Deny
// live on the push notification itself (see lib/notifications/push); this
// list stays a record rather than a console.

import type { Notification, NotificationEvent } from '@kroma/core';
import { groupNotificationsByDay, NOTIFICATION_DAY_LABEL } from '@kroma/core';
import { Box, color, Icon, IconButton, type IconName, styles, Text } from '@kroma/ui/kit';
import { useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Pressable, RefreshControl, SectionList } from 'react-native';
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
import { radius, spacing, type } from '#mobile/lib/theme';

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
              diameter={40}
              glyph={22}
              hitSlop={10}
              disabled={busy}
              label={t('notifications.markAllRead')}
              onPress={() => void markAll()}
            >
              <Icon name="checks" size={22} thickness={2} color="accentText" />
            </IconButton>
          ) : null
        }
      />

      {rows.length === 0 && !isPending ? (
        <EmptyState
          icon={<Icon name="bell" size={34} thickness={1.4} color="textMuted" />}
          title={t('notifications.empty')}
          hint={t('notifications.emptyHint')}
        />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(n) => n.id}
          contentContainerStyle={s.list}
          stickySectionHeadersEnabled
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={() => void refetch()}
              tintColor={color('textMuted')}
            />
          }
          renderSectionHeader={({ section }) => <Text style={s.dayLabel}>{section.title}</Text>}
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
          style={s.deleteAction}
          onPress={() => {
            swipe.current?.close();
            void remove();
          }}
          accessibilityRole="button"
          accessibilityLabel={t('common.delete')}
        >
          <Icon name="trash" size={20} thickness={2} color="white" />
        </Pressable>
      )}
    >
      <Pressable
        onPress={() => void open()}
        style={({ pressed }) => [s.row, pressed && s.rowPressed]}
      >
        {/* The gutter is here on every row, empty or not, so nothing shifts. */}
        <Box style={s.gutter}>{unread ? <Box style={s.dot} /> : null}</Box>

        {poster ? (
          <FadeImage uri={poster} seed={row.id} radius={radius.md} style={s.tile} />
        ) : (
          <Box style={[s.tile, s.tilePlate]}>
            <Icon name={glyph.name} size={20} thickness={1.8} color={glyph.color} />
          </Box>
        )}

        <Box style={s.body}>
          <Box style={s.titleRow}>
            <Text lines={1} style={[s.title, !unread && s.titleRead]}>
              {row.title}
            </Text>
            <Text style={s.time}>{sinceLabel(t, row.createdAt)}</Text>
          </Box>
          <Text lines={2} style={s.text}>
            {row.body}
          </Text>
        </Box>
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
// a near-black screen it goes muddy, so its lit step carries the glyph.
const DANGER_INK = 'dangerHover';

const EVENT_GLYPH: Record<string, { name: IconName; color: string }> = {
  'request.submitted': { name: 'inbox', color: 'accentText' },
  'request.approved': { name: 'circle-check', color: 'success' },
  'request.denied': { name: 'circle-x', color: DANGER_INK },
  'request.available': { name: 'sparkles', color: 'accentText' },
  'media.added': { name: 'player-play-filled', color: 'info' },
  'media.episode': { name: 'device-tv', color: 'info' },
  'report.submitted': { name: 'flag-3', color: 'hdr' },
  'report.resolved': { name: 'circle-check', color: 'success' },
  'report.dismissed': { name: 'circle-minus', color: 'textMuted' },
  'download.imported': { name: 'download', color: 'h265' },
  'download.failed': { name: 'alert-triangle', color: DANGER_INK },
  'system.job.failed': { name: 'server-bolt', color: DANGER_INK },
  'system.disk.low': { name: 'database', color: 'accentText' },
  'system.test': { name: 'bell-ringing', color: 'accentText' },
  custom: { name: 'sparkles', color: 'textMuted' },
};

function eventGlyph(event: NotificationEvent): { name: IconName; color: string } {
  return EVENT_GLYPH[event] ?? { name: 'bell', color: 'textMuted' };
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

const s = styles({
  list: { px: spacing.sm, pb: spacing.xl, ...boxed(contentWidth.reading) },
  dayLabel: {
    ...type.small,
    px: spacing.sm,
    pt: spacing.md,
    pb: 6,
    // Opaque: it is pinned while its own run scrolls underneath it.
    bg: 'bg',
    color: 'textDim',
    fontWeight: '600',
  },
  row: { row: true, align: 'flex-start', py: 10, pr: spacing.sm, pl: 6, radius: radius.md },
  // No unread wash: the dot carries it, and a tinted row under every unread
  // notification turns a backlog into one solid block.
  rowPressed: { bg: 'surface1' },
  gutter: { center: true, w: 6, h: 48, mr: 8 },
  dot: { w: 6, h: 6, bg: 'accent', radius: 3 },
  tile: { w: 48, h: 48, mr: 12, radius: radius.md },
  tilePlate: { center: true, bg: 'wash' },
  body: { flex: true, minW: 0 },
  titleRow: { row: true, align: 'flex-start', gap: 8 },
  title: { ...type.body, flex: true, minW: 0, color: 'text', fontWeight: '700' },
  titleRead: { color: 'textMuted' },
  time: { ...type.small, pt: 2, color: 'textDim', fontWeight: '500' },
  text: { ...type.caption, mt: 1, color: 'textMuted', lineHeight: 18 },
  deleteAction: { center: true, w: 72, ml: spacing.xs, bg: 'danger', radius: radius.md },
});
