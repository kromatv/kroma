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

import {
  groupNotificationsByDay,
  groupNotificationRepeats,
  NOTIFICATION_DAY_LABEL,
} from '@kromatv/core';

import { useMemo, useState } from 'react';
import { RefreshControl, SectionList } from 'react-native';
import { NotificationRow } from '#mobile/components/notification-row';
import { PageHeader } from '#mobile/components/PageHeader';
import { EmptyState, ErrorBanner, ErrorView, Loading, Screen } from '#mobile/components/ui';
import { useT } from '#mobile/lib/i18n';
import { boxed, contentWidth } from '#mobile/lib/layout';
import { useNotifications, useRefreshNotifications } from '#mobile/lib/notifications';
import { useClient } from '#mobile/lib/session';
import { spacing, type } from '#mobile/lib/theme';

export default function NotificationsScreen() {
  const scope = useStyleScope();
  useThemeVersion();

  const s = useStyles(sDefinition);

  const t = useT();
  const client = useClient();
  const refresh = useRefreshNotifications();
  const { data, isPending, isError, isRefetching, refetch } = useNotifications();
  const [busy, setBusy] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unread = data?.unread ?? 0;
  const rows = data?.notifications ?? [];
  const sections = useMemo(
    () =>
      groupNotificationsByDay(unreadOnly ? rows.filter((row) => !row.read) : rows).map((g) => ({
        title: t(NOTIFICATION_DAY_LABEL[g.day]),
        data: groupNotificationRepeats(g.items),
      })),
    [rows, t, unreadOnly],
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
  else if (sections.length === 0)
    content = (
      <EmptyState
        icon={<Icon name="bell" size={34} thickness={1.4} color="textMuted" />}
        title={t(unreadOnly ? 'notifications.emptyUnread' : 'notifications.empty')}
        hint={t(unreadOnly ? 'notifications.emptyUnreadHint' : 'notifications.emptyHint')}
      />
    );
  else
    content = (
      <SectionList
        sections={sections}
        keyExtractor={(run) => run.key}
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
        renderItem={({ item }) => <NotificationRow run={item} onError={setError} />}
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
          active={!unreadOnly}
          onPress={() => setUnreadOnly(false)}
        />
        <Chip
          label={
            unread > 0
              ? t('notifications.filterUnreadCount', { count: unread })
              : t('notifications.filterUnread')
          }
          active={unreadOnly}
          onPress={() => setUnreadOnly(true)}
        />
      </Box>
      {error ? <ErrorBanner message={error} /> : null}
      {content}
    </Screen>
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
