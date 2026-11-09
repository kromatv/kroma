// The notification centre: a bell whose badge counts what arrived since the
// drawer was last open, opening a drawer of notifications. A row carries two
// controls and no more: the notification itself, which opens it, and the toggle
// that moves it between read and unread without going anywhere. A notification with Approve/Deny still sends you to
// the queue those decisions belong to, so the drawer stays a list of what
// happened, not a console.

import { useT } from '@kromatv/ui';
import { Box, Drawer, Icon, IconButton, styles, Text, useStyles } from '@kromatv/ui/kit';
import { useState } from 'react';
import { PanelBody } from '#web/features/notifications/panel-body';
import { PanelHeader } from '#web/features/notifications/panel-header';
import {
  type NotificationFilter,
  useMarkSeen,
  usePanelState,
  useUnseenCount,
} from '#web/features/notifications/use-notifications';

/** Bell + badge + drawer. Mounted in the sidebar (desktop) and topbar (mobile). */
export function NotificationBell() {
  const s = useStyles(sDefinition);

  const t = useT();
  const unseen = useUnseenCount();
  const markSeen = useMarkSeen();
  const { open, setOpen, everOpened } = usePanelState();
  const [filter, setFilter] = useState<NotificationFilter>('all');
  const show = (next: boolean) => {
    setOpen(next);
    markSeen();
  };

  return (
    <>
      <IconButton
        variant={open ? 'glass' : 'ghost'}
        diameter={40}
        radius="md"
        label={
          unseen > 0 ? t('notifications.titleNew', { count: unseen }) : t('notifications.title')
        }
        expanded={open}
        onPress={() => show(true)}
      >
        <Icon name="bell" size={20} />
        {unseen > 0 ? (
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
              {unseen > 9 ? '9+' : unseen}
            </Text>
          </Box>
        ) : null}
      </IconButton>
      <Drawer.Root
        open={open}
        onClose={() => show(false)}
        title={t('notifications.title')}
        width="sm"
        fullBelow={640}
        pad={8}
        panelStyle={s.panelFill}
      >
        <Drawer.Header style={s.headerBand}>
          <PanelHeader filter={filter} onFilterChange={setFilter} />
        </Drawer.Header>
        <Drawer.Panel>
          {/* Mounted on first open and kept mounted after, so reopening doesn't refetch. */}
          {everOpened ? <PanelBody filter={filter} onNavigate={() => show(false)} /> : null}
        </Drawer.Panel>
      </Drawer.Root>
    </>
  );
}

const sDefinition = styles({
  panelFill: { bg: 'bg' },
  headerBand: { px: 16, paddingTop: 'max(1.15rem, env(safe-area-inset-top))', pb: 12 },
});

// The sheet takes the whole screen on a phone, so its first band clears the
// notch; `env()` has no React Native spelling.
