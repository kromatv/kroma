// One line of the drawer. Two controls sit on it, siblings and never one inside
// the other: the notification itself, and the read/unread toggle. The kit's rule
// that a row is ONE focus stop is about a row that is one control and whose
// indicator reflects its own state (DESIGN.md §2); a notification is an object
// with a destination AND a piece of state the reader must be able to change
// without going there, which is two verbs and so two controls. They are
// siblings, the way <SelectRow> and its trash button are in the player's
// subtitles panel, so neither swallows the other's press.
//
// The row spans the whole line and the toggle is laid OVER its right end, rather
// than the two sharing the width: a focus ring belongs around the notification,
// and a row holding only the left two thirds of the line cannot draw one.

import {
  type Notification,
  type NotificationRun,
  sizedImageUrl,
  type Translate,
} from '@kroma/core';
import { useT } from '@kroma/ui';
import { Badge, Box, Icon, IconButton, ListRow, Text } from '@kroma/ui/kit';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { notificationLink } from '#web/features/notifications/notification-link';
import {
  useExactTime,
  useRelativeTime,
  useStandaloneTime,
} from '#web/features/notifications/notification-time';
import { useReadState } from '#web/features/notifications/use-notifications';
import { NotificationCard } from '#web/shared/ui/notification-card';

// Items arrive newest-first, so the run started at the last of them. A burst
// that fits inside one unit of the format reads "from 7 min ago to 7 min ago",
// which says less than the count already does, so it says nothing.
function foldLabels(
  run: NotificationRun,
  latest: string,
  relative: (at: number) => string,
  t: Translate,
): { span: string | null; repeat: string | null } {
  const { head, items } = run;
  if (items.length <= 1) return { span: null, repeat: null };
  const oldest = relative(items[items.length - 1]?.createdAt ?? head.createdAt);
  return {
    span: oldest === latest ? null : t('notifications.repeatSpan', { first: oldest, last: latest }),
    repeat: t('notifications.repeatCount', { count: items.length }),
  };
}

export function NotificationEntry({
  run,
  onNavigate,
}: Readonly<{ run: NotificationRun; onNavigate: () => void }>) {
  const t = useT();
  const navigate = useNavigate();
  const relative = useRelativeTime();
  const standalone = useStandaloneTime();
  const { markRead } = useReadState();
  const [open, setOpen] = useState(false);

  const { head, items } = run;
  const folded = items.length > 1;
  const unread = run.unread > 0;
  const ids = items.map((n) => n.id);
  const latest = relative(head.createdAt);
  const { span, repeat } = foldLabels(run, latest, relative, t);

  function go(one: Notification) {
    markRead(ids);
    const to = notificationLink(one);
    if (to) {
      onNavigate();
      void navigate({ to });
    }
  }

  return (
    <Box bg={unread ? 'accent/6' : 'transparent'}>
      <Box>
        <ListRow.Root
          size="sm"
          label={[head.title, repeat, span].filter(Boolean).join(' · ')}
          expanded={folded ? open : undefined}
          onPress={() => (folded ? setOpen(!open) : go(head))}
          chevron={false}
          style={ROW_PAD}
        >
          <NotificationCard
            event={head.event}
            src={head.imageUrl ? sizedImageUrl(head.imageUrl, 96) : null}
            unread={unread}
            title={head.title}
            titleTone={unread ? 'text' : 'textMuted'}
            body={head.body}
            repeat={repeat ? <Badge tone={unread ? 'warning' : 'neutral'}>{repeat}</Badge> : null}
            meta={
              span ? (
                <Text variant="meta" color="textDim" lines={1} mt={3}>
                  {span}
                </Text>
              ) : null
            }
            time={
              <time dateTime={new Date(head.createdAt).toISOString()} style={TABULAR}>
                {standalone(head.createdAt)}
              </time>
            }
          />
          {folded ? (
            <ListRow.Trailing>
              <Icon name={open ? 'chevron-up' : 'chevron-down'} size={16} color="textDim" />
            </ListRow.Trailing>
          ) : null}
        </ListRow.Root>
        <Box absolute right={6} top={0} bottom={0} justify="center">
          <ReadToggle unread={unread} title={head.title} ids={ids} />
        </Box>
      </Box>
      {folded && open ? <Occurrences items={items} onOpen={go} /> : null}
    </Box>
  );
}

function ReadToggle({
  unread,
  title,
  ids,
}: Readonly<{ unread: boolean; title: string; ids: string[] }>) {
  const t = useT();
  const { markRead, markUnread } = useReadState();
  return (
    <IconButton
      variant="ghost"
      diameter={34}
      // The card it sits in draws its rings inward, which on a 34px disc lands
      // the ring inside the glyph. This one has room at the card's edge, so it
      // takes the ring on its own boundary instead.
      ring="focusEdge"
      active={unread}
      label={`${t(unread ? 'notifications.markRead' : 'notifications.markUnread')} · ${title}`}
      onPress={() => (unread ? markRead(ids) : markUnread(ids))}
    >
      <Icon
        name={unread ? 'circle-filled' : 'circle'}
        size={13}
        color={unread ? 'accentText' : 'textDim'}
      />
    </IconButton>
  );
}

// Room at the right for the toggle laid over the row, so a long title ellipses
// before it reaches the button rather than running under it.
const ROW_PAD = { paddingLeft: 8, paddingRight: 46 } as const;

const TABULAR = { fontVariantNumeric: 'tabular-nums' } as const;

const OCCURRENCE_PAD = { paddingLeft: 30, paddingTop: 4, paddingBottom: 4 } as const;

function Occurrences({
  items,
  onOpen,
}: Readonly<{ items: Notification[]; onOpen: (one: Notification) => void }>) {
  const exact = useExactTime();
  return (
    <Box pb={4}>
      {items.map((one) => (
        <ListRow.Root key={one.id} size="sm" onPress={() => onOpen(one)} style={OCCURRENCE_PAD}>
          <ListRow.Label>{exact(one.createdAt)}</ListRow.Label>
        </ListRow.Root>
      ))}
    </Box>
  );
}
