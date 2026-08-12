// The notification centre: a bell with an unread badge, opening a drawer of
// notifications. A row is a whole card — the card itself is the only control:
// opening it marks it read and follows its link. There are no per-row buttons;
// a notification with Approve/Deny sends you to the queue those decisions
// belong to, so the drawer stays a list of what happened, not a console.

import {
  groupNotificationsByDay,
  NOTIFICATION_DAY_LABEL,
  type Notification,
  sizedImageUrl,
} from '@kroma/core';
import { useLocale, useT } from '@kroma/ui';
import {
  Box,
  color,
  Drawer,
  EmptyState,
  Icon,
  IconButton,
  ListRow,
  Row,
  Skeleton,
  Spacer,
  Spinner,
  Text,
} from '@kroma/ui/kit';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import type { ViewStyle } from 'react-native';
import { usePanelState, useUnreadCount } from '#web/features/notifications/use-notifications';
import { kromaClient } from '#web/shared/lib/api';
import { userQueries } from '#web/shared/lib/queries';
import { NotificationCard } from '#web/shared/ui/notification-card';

/** Bell + badge + drawer. Mounted in the sidebar (desktop) and topbar (mobile). */
export function NotificationBell() {
  const t = useT();
  const unread = useUnreadCount();
  const { open, setOpen, everOpened } = usePanelState();

  return (
    <>
      <IconButton
        variant={open ? 'glass' : 'ghost'}
        size={40}
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
        width={400}
        fullBelow={640}
        pad={8}
        panelStyle={PANEL_FILL}
      >
        <Drawer.Header style={HEADER_BAND}>
          <PanelHeader />
        </Drawer.Header>
        <Drawer.Panel>
          {/* Mounted on first open and kept mounted after, so reopening doesn't refetch. */}
          {everOpened ? <PanelBody onNavigate={() => setOpen(false)} /> : null}
        </Drawer.Panel>
      </Drawer.Root>
    </>
  );
}

function PanelHeader() {
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
  return (
    <Row gap={8}>
      <h2 style={HEADING}>
        <Text variant="label">{t('notifications.title')}</Text>
      </h2>
      <Spacer />
      {/* Icon-only: the label is long in every language and crowded the title. */}
      <Row gap={2}>
        <IconButton
          variant="ghost"
          size={36}
          radius="lg"
          label={t('notifications.markAllRead')}
          onPress={() => void markAll()}
          disabled={markAllOff}
          style={markAllOff ? OFF : undefined}
        >
          {busy ? <Spinner size={17} /> : <Icon name="checks" size={18} />}
        </IconButton>
        <Drawer.Close size={36} radius="lg" glyph={18} />
      </Row>
    </Row>
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

const HEADING = { margin: 0 } as const;

const OFF = { opacity: 0.3 } as const;

function PanelBody({ onNavigate }: Readonly<{ onNavigate: () => void }>) {
  const t = useT();
  const { data, isPending } = useQuery(userQueries.notifications());

  if (isPending) {
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

  const items = data?.notifications ?? [];
  if (items.length === 0) {
    return (
      <EmptyState.Root size="sm" layout="fill" icon="bell">
        <EmptyState.Title>{t('notifications.empty')}</EmptyState.Title>
        <EmptyState.Hint>{t('notifications.emptyHint')}</EmptyState.Hint>
      </EmptyState.Root>
    );
  }

  return (
    <>
      {groupNotificationsByDay(items).map((group) => (
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
            {group.items.map((n) => (
              <NotificationRow key={n.id} notification={n} onNavigate={onNavigate} />
            ))}
          </ListRow.Group>
        </section>
      ))}
    </>
  );
}

const DAY_LABEL = { position: 'sticky', top: 0, zIndex: 10, margin: 0 } as const;

function NotificationRow({
  notification,
  onNavigate,
}: Readonly<{ notification: Notification; onNavigate: () => void }>) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Navigation doesn't wait on the read-write — a receipt isn't worth a frame
  // of dead click.
  function open() {
    if (!notification.read) {
      void kromaClient()
        .markNotificationsRead([notification.id])
        .then(() =>
          queryClient.invalidateQueries({ queryKey: userQueries.notifications().queryKey }),
        )
        .catch(() => undefined);
    }
    const to = destinationOf(notification);
    if (to) {
      onNavigate();
      void navigate({ to });
    }
  }

  const unread = !notification.read;
  return (
    <ListRow.Root
      size="sm"
      label={notification.title}
      onPress={open}
      chevron={false}
      style={ROW_PAD}
    >
      <NotificationCard
        event={notification.event}
        src={notification.imageUrl ? sizedImageUrl(notification.imageUrl, 96) : null}
        unread={unread}
        title={notification.title}
        titleTone={unread ? 'text' : 'textMuted'}
        body={notification.body}
        time={
          <time dateTime={new Date(notification.createdAt).toISOString()} style={TABULAR}>
            <RelativeTime at={notification.createdAt} />
          </time>
        }
      />
    </ListRow.Root>
  );
}

// The card draws its own gutter, so the row's leading inset is the gutter's.
const ROW_PAD = { paddingLeft: 8 } as const;

const TABULAR = { fontVariantNumeric: 'tabular-nums' } as const;

/** A notification row's contents: gutter, tile, title/time line, clamped body.
 * Exported so the admin composer's preview renders the real row markup rather
 * than a hand-copied approximation; the caller supplies the shell and tones. */
// The notification's own `link`, else its first `link`-kind action. `api`
// actions (Approve, Deny) have no destination — deliberately not offered here,
// since their notification links to the queue where the decision belongs.
function destinationOf(notification: Notification): string | undefined {
  if (notification.link) return notification.link;
  return notification.actions.find((a) => a.kind === 'link')?.href;
}

// `Intl.RelativeTimeFormat` renders the zero case as the CURRENT unit rather
// than an elapsed one ("this minute"), so it's special-cased to "just now".
// `short` style is used over `narrow`, which renders French as "-47 min".
function RelativeTime({ at }: Readonly<{ at: number }>) {
  const t = useT();
  const locale = useLocale();
  const mins = Math.max(0, Math.round((Date.now() - at) / 60_000));
  if (mins < 1) return <>{t('notifications.justNow')}</>;
  const fmt = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' });
  if (mins < 60) return <>{fmt.format(-mins, 'minute')}</>;
  const hours = Math.round(mins / 60);
  if (hours < 24) return <>{fmt.format(-hours, 'hour')}</>;
  const days = Math.round(hours / 24);
  if (days < 7) return <>{fmt.format(-days, 'day')}</>;
  return <>{new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(at)}</>;
}
