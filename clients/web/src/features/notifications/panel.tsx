// The notification centre: a bell with an unread badge, opening a drawer of
// notifications. A row carries two controls and no more: the notification
// itself, which opens it, and the toggle that moves it between read and unread
// without going anywhere. A notification with Approve/Deny still sends you to
// the queue those decisions belong to, so the drawer stays a list of what
// happened, not a console.

import { useT } from '@kroma/ui';
import { Box, color, Drawer, Icon, IconButton, Text } from '@kroma/ui/kit';
import { useState } from 'react';
import type { ViewStyle } from 'react-native';
import { PanelBody } from '#web/features/notifications/panel-body';
import { PanelHeader } from '#web/features/notifications/panel-header';
import {
  type NotificationFilter,
  usePanelState,
  useUnreadCount,
} from '#web/features/notifications/use-notifications';

/** Bell + badge + drawer. Mounted in the sidebar (desktop) and topbar (mobile). */
export function NotificationBell() {
  const t = useT();
  const unread = useUnreadCount();
  const { open, setOpen, everOpened } = usePanelState();
  const [filter, setFilter] = useState<NotificationFilter>('all');

  return (
    <>
      <IconButton
        variant={open ? 'glass' : 'ghost'}
        diameter={40}
        radius="md"
        label={unread > 0 ? `${t('notifications.title')} (${unread})` : t('notifications.title')}
        expanded={open}
        onPress={() => setOpen(true)}
      >
        <Icon name="bell" size={20} />
        {unread > 0 ? (
          // Caps at 9+ so the badge doesn't outgrow the bell.
          <Box
            absolute
            top={-2}
            right={-2}
            minW={18}
            h={18}
            px={4}
            center
            radius="pill"
            bg="accent"
            border="bg"
            borderWidth={2}
          >
            <Text variant="overline" color="accentInk">
              {unread > 9 ? '9+' : unread}
            </Text>
          </Box>
        ) : null}
      </IconButton>
      <Drawer.Root
        open={open}
        onClose={() => setOpen(false)}
        title={t('notifications.title')}
        width="sm"
        fullBelow={640}
        pad={8}
        panelStyle={PANEL_FILL}
      >
        <Drawer.Header style={HEADER_BAND}>
          <PanelHeader filter={filter} onFilterChange={setFilter} />
        </Drawer.Header>
        <Drawer.Panel>
          {/* Mounted on first open and kept mounted after, so reopening doesn't refetch. */}
          {everOpened ? <PanelBody filter={filter} onNavigate={() => setOpen(false)} /> : null}
        </Drawer.Panel>
      </Drawer.Root>
    </>
  );
}

const PANEL_FILL = { backgroundColor: color('bg') } as const;

// The sheet takes the whole screen on a phone, so its first band clears the
// notch; `env()` has no React Native spelling.
const HEADER_BAND = {
  paddingLeft: 16,
  paddingRight: 16,
  paddingTop: 'max(1.15rem, env(safe-area-inset-top))',
  paddingBottom: 12,
} as unknown as ViewStyle;
