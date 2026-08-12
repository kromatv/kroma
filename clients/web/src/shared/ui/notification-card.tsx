// What one notification looks like, wherever it is shown: the drawer's rows
// and the admin bench's preview are the same card, so what an author sees
// before sending is what recipients get.

import type { KNOWN_NOTIFICATION_EVENTS, NotificationEvent } from '@kroma/core';
import { Box, type ColorToken, Icon, type IconName, Row, Text, useTheme } from '@kroma/ui/kit';
import type { CSSProperties, ReactNode } from 'react';

const CARD_ROW = { display: 'flex', flex: 1, alignItems: 'flex-start' } as const;

export function NotificationCard({
  style,
  event,
  src,
  unread,
  title,
  titleTone = 'text',
  body,
  bodyTone = 'textMuted',
  time,
}: Readonly<{
  /** The shell the card sits in, padding included: a drawer row takes its
   *  <ListRow.Root>'s, the composer's preview draws its own. */
  style?: CSSProperties;
  event: NotificationEvent;
  src: string | null;
  unread: boolean;
  title: ReactNode;
  /** Quietens the title for a row already read, or for a composer preview with
   *  nothing typed into it yet. */
  titleTone?: ColorToken;
  body: ReactNode;
  bodyTone?: ColorToken;
  time: ReactNode;
}>) {
  return (
    <div style={style ? { ...CARD_ROW, ...style } : CARD_ROW}>
      {/* The gutter is reserved on every row, empty or not, so nothing shifts. */}
      <Row w={6} h={48} shrink={0} mr={8}>
        {unread ? <Box w={6} h={6} radius="circle" bg="accent" /> : null}
      </Row>
      <NotificationTile event={event} src={src} />
      <Box minW={0} flex={1}>
        <Box row align="flex-start" gap={8}>
          <Text variant="label" color={titleTone} lines={1} minW={0} flex={1}>
            {title}
          </Text>
          <Text variant="meta" color="textDim" shrink={0} pt={3}>
            {time}
          </Text>
        </Box>
        <Text variant="meta" color={bodyTone} lines={2} mt={2}>
          {body}
        </Text>
      </Box>
    </div>
  );
}

/** The 48px leading tile: artwork when the notification carries some, else the
 * event glyph on a neutral plate (kept neutral so the glyph's colour is the
 * signal). `src` arrives already resolved by the caller. */
export function NotificationTile({
  event,
  src,
}: Readonly<{ event: NotificationEvent; src?: string | null }>) {
  const { radius } = useTheme();
  if (src) {
    return (
      <img
        src={src}
        alt=""
        loading="lazy"
        style={{
          width: 48,
          height: 48,
          flexShrink: 0,
          marginRight: 12,
          borderRadius: radius.lg,
          objectFit: 'cover',
        }}
      />
    );
  }
  return (
    <Box w={48} h={48} shrink={0} mr={12} center radius="lg" bg="white/6">
      <NotificationGlyph event={event} />
    </Box>
  );
}

function NotificationGlyph({
  event,
  size = 20,
}: Readonly<{ event: NotificationEvent; size?: number }>) {
  const meta = eventMeta(event);
  return <Icon name={meta.icon} size={size} thickness={1.8} color={meta.fg} />;
}

interface EventMeta {
  icon: IconName;
  fg: ColorToken;
}

// Keyed on the KNOWN list, not on `NotificationEvent` (an open union a newer
// server may extend): a known event missing an entry is a type error, an
// unknown one just falls back.
const EVENT_META: Record<(typeof KNOWN_NOTIFICATION_EVENTS)[number], EventMeta> = {
  'request.submitted': { icon: 'inbox', fg: 'accent' },
  'request.approved': { icon: 'circle-check', fg: 'success' },
  'request.denied': { icon: 'circle-x', fg: 'dangerHover' },
  'request.available': { icon: 'sparkles', fg: 'accent' },
  'media.added': { icon: 'player-play-filled', fg: 'info' },
  'media.episode': { icon: 'device-tv', fg: 'info' },
  'report.submitted': { icon: 'flag-3', fg: 'hdr' },
  'report.resolved': { icon: 'circle-check', fg: 'success' },
  'report.dismissed': { icon: 'circle-minus', fg: 'textMuted' },
  'download.imported': { icon: 'download', fg: 'h265' },
  'download.failed': { icon: 'alert-triangle', fg: 'dangerHover' },
  'system.job.failed': { icon: 'server-bolt', fg: 'dangerHover' },
  'system.disk.low': { icon: 'database', fg: 'accent' },
  'system.test': { icon: 'bell-ringing', fg: 'accent' },
  // A module's own event has no vocabulary this app can read, so it stays neutral.
  custom: { icon: 'sparkles', fg: 'textMuted' },
};

const FALLBACK_META: EventMeta = { icon: 'bell', fg: 'textMuted' };

function eventMeta(event: NotificationEvent): EventMeta {
  return (EVENT_META as Record<string, EventMeta | undefined>)[event] ?? FALLBACK_META;
}
