// One line of the drawer. Two controls sit on it, side by side and never one
// inside the other: the notification itself, and the read/unread toggle. The
// kit's rule that a row is ONE focus stop is about a row that is one control
// and whose indicator reflects its own state (DESIGN.md §2); a notification is
// an object with a destination AND a piece of state the reader must be able to
// change without going there, which is two verbs and so two controls. They are
// siblings, the way <SelectRow> and its trash button are in the player's
// subtitles panel, so neither swallows the other's press.

import {
  type Notification,
  type NotificationRun,
  sizedImageUrl,
  type Translate,
} from '@kroma/core';
import { useT } from '@kroma/ui';
import { Badge, Box, Icon, IconButton, ListRow, Row, Text } from '@kroma/ui/kit';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useExactTime, useRelativeTime } from '#web/features/notifications/notification-time';
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
    const to = destinationOf(one);
    if (to) {
      onNavigate();
      void navigate({ to });
    }
  }

  return (
    <Box bg={unread ? 'accent/6' : 'transparent'}>
      <Row>
        <Box flex minW={0}>
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
                  {latest}
                </time>
              }
            />
            {folded ? (
              <ListRow.Trailing>
                <Icon name={open ? 'chevron-up' : 'chevron-down'} size={16} color="textDim" />
              </ListRow.Trailing>
            ) : null}
          </ListRow.Root>
        </Box>
        <ReadToggle unread={unread} title={head.title} ids={ids} />
      </Row>
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
    <Box pl={2} pr={8}>
      <IconButton
        variant="ghost"
        diameter={34}
        radius="lg"
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
    </Box>
  );
}

const ROW_PAD = { paddingLeft: 8 } as const;

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

// The notification's own `link`, else its first `link`-kind action. `api`
// actions (Approve, Deny) have no destination, deliberately not offered here,
// since their notification links to the queue where the decision belongs.
function destinationOf(notification: Notification): string | undefined {
  if (notification.link) return notification.link;
  return notification.actions.find((a) => a.kind === 'link')?.href;
}
