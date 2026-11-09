import {
  activeTheme,
  Box,
  Chip,
  color,
  Icon,
  IconButton,
  styles,
  Text,
  useStyleScope,
  useStyles,
  useThemeVersion,
} from '@kromatv/ui/kit';

import { groupNotificationsByDay, NOTIFICATION_DAY_LABEL } from '@kromatv/core';

import { useIsFocused } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { RefreshControl, SectionList } from 'react-native';
import { NotificationRow } from '#mobile/components/notification-row';
import { PageHeader } from '#mobile/components/PageHeader';
import { EmptyState, ErrorBanner, ErrorView, Loading, Screen } from '#mobile/components/ui';
import { useT } from '#mobile/lib/i18n';
import { boxed, contentWidth } from '#mobile/lib/layout';
import {
  useArchivedNotifications,
  useMarkSeen,
  useNotifications,
  useRefreshNotifications,
} from '#mobile/lib/notifications';
import { useClient } from '#mobile/lib/session';
import { spacing, type } from '#mobile/lib/theme';

export default function NotificationsScreen() {
  const scope = useStyleScope();
  useThemeVersion();

  const s = useStyles(sDefinition);

  const t = useT();
  const client = useClient();
  const refresh = useRefreshNotifications();
  const inbox = useNotifications();
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread' | 'archived'>('all');
  const [error, setError] = useState<string | null>(null);
  const canArchive = inbox.data?.canArchive ?? false;
  const shelf = canArchive && filter === 'archived';
  const archive = useArchivedNotifications(shelf);
  const { data, isPending, isError, isRefetching, refetch } = shelf ? archive : inbox;
  const focused = useIsFocused();
  const markSeen = useMarkSeen();
  const unseen = inbox.data?.unseen ?? 0;

  useEffect(() => {
    if (focused && unseen > 0) markSeen();
  }, [focused, unseen, markSeen]);

  const unread = inbox.data?.unread ?? 0;
  const rows = data?.notifications ?? [];
  const sections = useMemo(
    () =>
      groupNotificationsByDay(filter === 'unread' ? rows.filter((row) => !row.read) : rows).map(
        (g) => ({
          title: t(NOTIFICATION_DAY_LABEL[g.day]),
          data: g.items,
        }),
      ),
    [rows, t, filter],
  );

  async function markAll() {
    setBusy(true);
    setError(null);
    try {
      await client.notifications.markAllRead();
      refresh();
    } catch {
      setError(t('error.serverBody'));
    } finally {
      setBusy(false);
    }
  }

  let content;
  if (isPending) content = <Loading />;
  else if (isError && !data)
    content = (
      <ErrorView
        message={t('error.serverBody')}
        retryLabel={t('error.retry')}
        onRetry={() => void refetch()}
      />
    );
  else if (sections.length === 0) content = <EmptyInbox filter={shelf ? 'archived' : filter} />;
  else
    content = (
      <SectionList
        sections={sections}
        keyExtractor={(row) => row.id}
        contentContainerStyle={s.list}
        stickySectionHeadersEnabled
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => void refetch()}
            tintColor={color('textMuted', activeTheme(scope.theme))}
          />
        }
        renderSectionHeader={({ section }) => <Text style={s.dayLabel}>{section.title}</Text>}
        renderItem={({ item }) => (
          <NotificationRow row={item} canArchive={canArchive} archived={shelf} onError={setError} />
        )}
      />
    );

  return (
    <Screen padded={false}>
      <PageHeader
        title={t('notifications.title')}
        right={
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

      <Box style={s.filters}>
        <Chip
          label={t('notifications.filterAll')}
          active={filter === 'all'}
          onPress={() => setFilter('all')}
        />
        <Chip
          label={
            unread > 0
              ? t('notifications.filterUnreadCount', { count: unread })
              : t('notifications.filterUnread')
          }
          active={filter === 'unread'}
          onPress={() => setFilter('unread')}
        />
        {canArchive ? (
          <Chip
            label={t('notifications.filterArchived')}
            active={filter === 'archived'}
            onPress={() => setFilter('archived')}
          />
        ) : null}
      </Box>
      {error ? <ErrorBanner message={error} /> : null}
      {content}
    </Screen>
  );
}

const EMPTY = {
  all: ['bell', 'notifications.empty', 'notifications.emptyHint'],
  unread: ['bell', 'notifications.emptyUnread', 'notifications.emptyUnreadHint'],
  archived: ['archive', 'notifications.emptyArchived', 'notifications.emptyArchivedHint'],
} as const;

function EmptyInbox({ filter }: Readonly<{ filter: keyof typeof EMPTY }>) {
  const t = useT();
  const [icon, title, hint] = EMPTY[filter];
  return (
    <EmptyState
      icon={<Icon name={icon} size={34} thickness={1.4} color="textMuted" />}
      title={t(title)}
      hint={t(hint)}
    />
  );
}

const sDefinition = styles({
  filters: {
    row: true,
    gap: spacing.sm,
    px: spacing.md,
    py: spacing.sm,
    ...boxed(contentWidth.reading),
  },
  list: { px: spacing.md, pb: spacing.xl, ...boxed(contentWidth.reading) },
  dayLabel: {
    ...type.small,
    pt: spacing.md,
    pb: spacing.sm,
    bg: 'bg',
    color: 'textDim',
    fontWeight: '600',
  },
});
