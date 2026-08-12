import { useT } from '@kroma/ui';
import {
  Box,
  Drawer,
  Icon,
  IconButton,
  Row,
  SegmentedControl,
  Spacer,
  Spinner,
  Text,
} from '@kroma/ui/kit';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  type NotificationFilter,
  useUnreadCount,
} from '#web/features/notifications/use-notifications';
import { kromaClient } from '#web/shared/lib/api';
import { userQueries } from '#web/shared/lib/queries';

/** The drawer's fixed half: what the panel is, what it is showing, and the two
 * things that act on the whole of it. */
export function PanelHeader({
  filter,
  onFilterChange,
}: Readonly<{ filter: NotificationFilter; onFilterChange: (next: NotificationFilter) => void }>) {
  const t = useT();
  const queryClient = useQueryClient();
  const unread = useUnreadCount();
  const [busy, setBusy] = useState(false);

  async function markAll() {
    setBusy(true);
    try {
      await kromaClient().markAllNotificationsRead();
      await queryClient.invalidateQueries({ queryKey: userQueries.notifications().queryKey });
    } finally {
      setBusy(false);
    }
  }

  const markAllOff = unread === 0 || busy;
  const unreadLabel = t('notifications.filterUnread');
  return (
    <Box gap={10}>
      <Row gap={8}>
        <h2 style={HEADING}>
          <Text variant="label">{t('notifications.title')}</Text>
        </h2>
        <Spacer />
        {/* Icon-only: the label is long in every language and crowded the title. */}
        <Row gap={2}>
          <IconButton
            variant="ghost"
            diameter={36}
            radius="lg"
            label={t('notifications.markAllRead')}
            onPress={() => void markAll()}
            disabled={markAllOff}
            style={markAllOff ? OFF : undefined}
          >
            {busy ? <Spinner size={17} /> : <Icon name="checks" size={18} />}
          </IconButton>
          <Drawer.Close diameter={36} radius="lg" glyph={18} />
        </Row>
      </Row>
      <SegmentedControl.Root<NotificationFilter>
        value={filter}
        onValueChange={onFilterChange}
        label={t('notifications.filter')}
        size="sm"
        stretch
        options={[
          { value: 'all', label: t('notifications.filterAll') },
          { value: 'unread', label: unread > 0 ? `${unreadLabel} (${unread})` : unreadLabel },
        ]}
      />
    </Box>
  );
}

const HEADING = { margin: 0 } as const;

const OFF = { opacity: 0.3 } as const;
