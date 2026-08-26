import type { PlaybackSession, TopUser } from '@kroma/core';
import { TABULAR } from '@kroma/module-sdk';
import { useFormat, useT } from '@kroma/ui';
import {
  Avatar,
  Box,
  color,
  Divider,
  EmptyState,
  Grid,
  Row,
  Section,
  Select,
  Surface,
  Text,
} from '@kroma/ui/kit';
import { useMemo, useState } from 'react';
import { HistoryBars } from '#web/features/admin/charts';
import { BandwidthSection, CpuSection, RamSection } from '#web/features/admin/dashboard-metrics';
import { NowPlayingCard, StopStreamModal } from '#web/features/admin/dashboard-now-playing';
import { RealtimeBadge } from '#web/features/admin/realtime-badge';
import { PageHeader, useAdmin, usePoll } from '#web/features/admin/shell';
import { useAuth } from '#web/shared/lib/auth';

function RangeSelect({
  value,
  onChange,
  options,
  label,
}: Readonly<{
  value: number;
  onChange: (days: number) => void;
  options: number[];
  label: string;
}>) {
  const t = useT();
  return (
    <Select.Root label={label} value={String(value)} onValueChange={(v) => onChange(Number(v))}>
      <Select.Trigger />
      {options.map((d) => (
        <Select.Item key={d} value={String(d)} label={t('admin.lastNdays', { count: d })} />
      ))}
    </Select.Root>
  );
}

export function DashboardScreen() {
  const t = useT();
  const { client } = useAuth();
  const { serverInfo } = useAdmin();

  const [topDays, setTopDays] = useState(7);
  const [historyDays, setHistoryDays] = useState(30);

  const { data: sessionsData, reload: reloadSessions } = usePoll(
    ['admin', 'sessions'],
    () => client.adminSessions(),
    3000,
  );
  // The server samples every 3s; polling faster only redraws identical charts.
  const { data: metrics } = usePoll(['admin', 'metrics'], () => client.adminMetrics(), 5000);
  const { data: top } = usePoll(
    ['admin', 'topUsers', topDays],
    () => client.topUsers(topDays),
    30000,
  );
  const { data: history } = usePoll(
    ['admin', 'playHistory', historyDays],
    () => client.playHistory(historyDays),
    60000,
  );
  // The authenticated roster, not the public list `publicUserList` can hide.
  // Needs `users.manage`; without it cards fall back to name-based avatars.
  const { data: usersData } = usePoll(['admin', 'users'], () => client.adminUsers(), 60000);

  const sessions = sessionsData?.sessions ?? [];
  const askStop = async (session: PlaybackSession) => {
    if (await StopStreamModal.call({ session })) reloadSessions();
  };
  const avatarByUser = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const u of usersData?.users ?? []) m.set(u.id, u.avatarUrl ?? null);
    return m;
  }, [usersData]);

  return (
    <>
      <PageHeader.Root>
        <PageHeader.Title suffix={t('admin.dashboardSuffix')}>
          {serverInfo?.name ?? 'KROMA'}
        </PageHeader.Title>
        <PageHeader.Actions>
          <RealtimeBadge />
        </PageHeader.Actions>
      </PageHeader.Root>

      <Section.Root mt={28}>
        <Section.Header>
          <Section.Title>{t('admin.nowPlaying')}</Section.Title>
        </Section.Header>
        {sessions.length === 0 ? (
          <EmptyState.Root icon="player-play">
            <EmptyState.Title>{t('admin.noPlayback')}</EmptyState.Title>
          </EmptyState.Root>
        ) : (
          <Box gap={14}>
            {sessions.map((s) => (
              <NowPlayingCard
                key={s.id}
                s={s}
                avatarUrl={s.userId ? avatarByUser.get(s.userId) : null}
                onStop={() => void askStop(s)}
              />
            ))}
          </Box>
        )}
      </Section.Root>

      <BandwidthSection metrics={metrics} />
      <CpuSection metrics={metrics} />
      <RamSection metrics={metrics} />

      <Section.Root mt={28}>
        <Section.Header>
          <Section.Title>{t('admin.topUsers')}</Section.Title>
          <Section.Actions>
            <RangeSelect
              label={t('admin.topUsers')}
              value={topDays}
              onChange={setTopDays}
              options={[7, 30, 90]}
            />
          </Section.Actions>
        </Section.Header>
        {top && top.users.length > 0 ? (
          <Grid min={200} gap={16}>
            {top.users.slice(0, 3).map((u) => (
              <TopUserCard key={u.username} u={u} />
            ))}
          </Grid>
        ) : (
          <EmptyState.Root icon="users">
            <EmptyState.Title>{t('admin.noHistory')}</EmptyState.Title>
          </EmptyState.Root>
        )}
      </Section.Root>

      <Section.Root mt={28}>
        <Section.Header>
          <Section.Title>{t('admin.playHistory')}</Section.Title>
          <Section.Actions>
            <RangeSelect
              label={t('admin.playHistory')}
              value={historyDays}
              onChange={setHistoryDays}
              options={[30, 90, 180]}
            />
          </Section.Actions>
        </Section.Header>
        {history ? <HistoryBars buckets={history.buckets} label={t('admin.playHistory')} /> : null}
      </Section.Root>
    </>
  );
}

const ROW_RULE = { borderBottomWidth: 1, borderBottomColor: color('tint/4') } as const;

function TopUserCard({ u }: Readonly<{ u: TopUser }>) {
  const t = useT();
  const fmt = useFormat();
  const rows = [
    { label: t('admin.films'), val: fmt.duration(u.filmsMs), on: u.filmsMs >= u.tvMs },
    { label: t('admin.tv'), val: fmt.duration(u.tvMs), on: u.tvMs > u.filmsMs },
  ];
  return (
    <Surface elevated pad="none" radius="xl" border="border" overflow="hidden">
      <Row gap={14} px={20} py={18}>
        <Avatar name={u.username} size={48} circle />
        <Box>
          <Text variant="title">
            {u.plays} {u.plays > 1 ? t('admin.plays') : t('admin.play')}
          </Text>
          <Text variant="meta" color="textMuted">
            {fmt.duration(u.watchedMs)}
          </Text>
        </Box>
      </Row>
      <Divider color="tint/5" />
      <Box bg="surface2" px={20} py={11}>
        <Text variant="label">{u.username}</Text>
      </Box>
      <Divider color="tint/5" />
      <Box>
        {rows.map((r) => (
          <Row
            key={r.label}
            between
            px={20}
            py={11}
            bg={r.on ? 'accentWash/16' : 'transparent'}
            style={ROW_RULE}
          >
            <Text variant="meta" color={r.on ? 'accentText' : 'textMuted'}>
              {r.label}
            </Text>
            <Text variant="meta" color={r.on ? 'accentText' : 'textMuted'} style={TABULAR}>
              {r.val}
            </Text>
          </Row>
        ))}
      </Box>
    </Surface>
  );
}
