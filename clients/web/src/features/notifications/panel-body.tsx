import {
  groupNotificationRepeats,
  groupNotificationsByDay,
  NOTIFICATION_DAY_LABEL,
} from '@kroma/core';
import { useT } from '@kroma/ui';
import { Box, EmptyState, ListRow, Row, Skeleton, Text } from '@kroma/ui/kit';
import { useQuery } from '@tanstack/react-query';
import { useRef } from 'react';
import { NotificationEntry } from '#web/features/notifications/notification-row';
import {
  NO_STICKY,
  type NotificationFilter,
  unreadView,
} from '#web/features/notifications/use-notifications';
import { userQueries } from '#web/shared/lib/queries';

/** The drawer's scrolling half: day headings, and the rows folded under them. */
export function PanelBody({
  filter,
  onNavigate,
}: Readonly<{ filter: NotificationFilter; onNavigate: () => void }>) {
  const t = useT();
  const { data, isPending } = useQuery(userQueries.notifications());
  // Held across renders on purpose: the set is what keeps a row the reader just
  // marked read from vanishing before they can undo it, and an effect would
  // only decide that a frame after it had already gone.
  const sticky = useRef<ReadonlySet<string>>(NO_STICKY);

  if (isPending) return <PanelSkeleton />;

  const all = data?.notifications ?? [];
  let rows = all;
  if (filter === 'unread') {
    const view = unreadView(all, sticky.current);
    sticky.current = view.sticky;
    rows = view.items;
  } else {
    sticky.current = NO_STICKY;
  }

  if (rows.length === 0) {
    const bare = filter === 'unread' && all.length > 0;
    return (
      <EmptyState.Root size="sm" layout="fill" icon={bare ? 'checks' : 'bell'}>
        <EmptyState.Title>
          {t(bare ? 'notifications.emptyUnread' : 'notifications.empty')}
        </EmptyState.Title>
        <EmptyState.Hint>
          {t(bare ? 'notifications.emptyUnreadHint' : 'notifications.emptyHint')}
        </EmptyState.Hint>
      </EmptyState.Root>
    );
  }

  return (
    <>
      {groupNotificationsByDay(rows).map((group) => (
        // Keyed on the run's first row, not the day: an unsorted inbox can open a
        // second "Earlier" run, and two sections must not share a key.
        <section key={group.items[0]?.id}>
          {/* h3, not h2: the panel header renders the h2. */}
          <h3 style={DAY_LABEL}>
            <Box bg="bg" px={8} pt={12} pb={6}>
              <Text variant="meta" color="textDim">
                {t(NOTIFICATION_DAY_LABEL[group.day])}
              </Text>
            </Box>
          </h3>
          <ListRow.Group size="sm">
            {groupNotificationRepeats(group.items).map((run) => (
              <NotificationEntry key={run.head.id} run={run} onNavigate={onNavigate} />
            ))}
          </ListRow.Group>
        </section>
      ))}
    </>
  );
}

const DAY_LABEL = { position: 'sticky', top: 0, zIndex: 10, margin: 0 } as const;

function PanelSkeleton() {
  return (
    <Box>
      {[0, 1, 2, 3].map((i) => (
        <Row key={i} align="flex-start" gap={12} p={10} pl={16}>
          <Skeleton w={48} h={48} radius="xl" />
          <Box flex gap={8} pt={4}>
            <Skeleton h={12} w="40%" radius="pill" />
            <Skeleton h={10} w="80%" radius="pill" />
          </Box>
        </Row>
      ))}
    </Box>
  );
}
