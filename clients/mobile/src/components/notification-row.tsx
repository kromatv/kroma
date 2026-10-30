import type { Notification, NotificationEvent } from '@kromatv/client/notifications';
import { notificationUpdatedAt } from '@kromatv/core';
import {
  Box,
  radius as cornerRadius,
  Icon,
  IconButton,
  type IconName,
  styles,
  Text,
  useStyles,
} from '@kromatv/ui/kit';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable } from 'react-native';
import { FadeImage } from '#mobile/components/FadeImage';
import { useT } from '#mobile/lib/i18n';
import { mobileRoute, subjectRoute, useRefreshNotifications } from '#mobile/lib/notifications';
import { useClient } from '#mobile/lib/session';
import { radius, spacing, type } from '#mobile/lib/theme';

export function NotificationRow({
  row,
  onError,
}: Readonly<{ row: Notification; onError(message: string | null): void }>) {
  const s = useStyles(sDefinition);
  const t = useT();
  const client = useClient();
  const router = useRouter();
  const refresh = useRefreshNotifications();
  const [busy, setBusy] = useState(false);
  const poster = client.media.artwork.resolve(row.imageUrl, 128);
  const route = destinationOf(row);
  const glyph = eventGlyph(row.event);
  const unread = !row.read;

  async function perform(action: () => Promise<unknown>) {
    setBusy(true);
    onError(null);
    try {
      await action();
    } catch {
      onError(t('error.serverBody'));
    } finally {
      refresh();
      setBusy(false);
    }
  }

  function open() {
    if (unread) void perform(() => client.notifications.markRead([row.id]));
    if (route) router.push(route as never);
  }

  function showActions() {
    Alert.alert(row.title, undefined, [
      {
        text: t(unread ? 'notifications.markRead' : 'notifications.markUnread'),
        onPress: () =>
          void perform(() =>
            unread
              ? client.notifications.markRead([row.id])
              : client.notifications.markUnread([row.id]),
          ),
      },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => void perform(() => client.notifications.delete(row.id)),
      },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  }

  return (
    <Box style={[s.card, unread && s.cardUnread]}>
      <Pressable
        accessibilityRole="button"
        disabled={busy}
        onPress={open}
        onLongPress={showActions}
        style={({ pressed }) => [s.row, pressed && s.rowPressed]}
      >
        {poster ? (
          <FadeImage uri={poster} seed={row.id} radius={radius.md} style={s.tile} />
        ) : (
          <Box style={[s.tile, s.tilePlate]}>
            <Icon name={glyph.name} size={22} thickness={1.8} color={glyph.color} />
          </Box>
        )}
        <Box style={s.body}>
          <Text lines={2} style={[s.title, !unread && s.titleRead]}>
            {row.title}
          </Text>
          <Text lines={3} style={s.text}>
            {row.body}
          </Text>
          <Box style={s.meta}>
            {unread ? <Box style={s.dot} /> : null}
            <Text style={s.time}>{sinceLabel(t, notificationUpdatedAt(row))}</Text>
            {row.count > 1 ? (
              <Text style={s.repeat}>{t('notifications.repeatCount', { count: row.count })}</Text>
            ) : null}
            {row.resolved ? (
              <Text style={s.repeat}>
                {row.resolvedBy
                  ? t('notifications.resolvedBy', { user: row.resolvedBy.name })
                  : t('notifications.resolved')}
              </Text>
            ) : null}
          </Box>
        </Box>
      </Pressable>
      <IconButton
        variant="ghost"
        diameter={36}
        disabled={busy}
        label={t('notifications.actions')}
        onPress={showActions}
        style={s.more}
      >
        <Icon name="dots" size={19} color="textDim" />
      </IconButton>
    </Box>
  );
}

function destinationOf(row: Notification): string | null {
  const about = subjectRoute(row.subject);
  if (about) return about;
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

const sDefinition = styles({
  card: {
    bg: 'surface1',
    radius: radius.lg,
    mb: spacing.sm,
    overflow: 'hidden',
    border: 'border',
  },
  cardUnread: { border: 'accent/25' },
  row: { row: true, align: 'flex-start', gap: 12, p: spacing.md, pr: 44 },
  rowPressed: { bg: 'surface2' },
  dot: { w: 6, h: 6, bg: 'accent', radius: cornerRadius.indicator },
  tile: { w: 48, h: 60, radius: radius.md, shrink: 0 },
  tilePlate: { center: true, bg: 'wash' },
  body: { flex: true, minW: 0 },
  title: { ...type.body, color: 'text', fontWeight: '700' },
  titleRead: { color: 'textMuted' },
  text: { ...type.caption, mt: 4, color: 'textMuted' },
  meta: { row: true, wrap: true, align: 'center', gap: 8, mt: spacing.sm },
  time: { ...type.small, color: 'textDim' },
  repeat: { ...type.small, color: 'accentText' },
  more: { absolute: true, top: 6, right: 4 },
});
