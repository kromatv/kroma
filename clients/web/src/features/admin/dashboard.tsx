import type { MetricsSnapshot, PlaybackSession, TopUser } from '@kroma/core';
import { useT } from '@kroma/ui';
import { Avatar, color, EmptyState, Section, Select, Surface } from '@kroma/ui/kit';
import { useMemo, useState } from 'react';
import { CHART_SERIES } from '#web/features/admin/chart-palette';
import { HistoryBars, MetricsChart } from '#web/features/admin/charts';
import { NowPlayingCard, StopStreamModal } from '#web/features/admin/dashboard-now-playing';
import { RealtimeBadge } from '#web/features/admin/realtime-badge';
import { PageHeader, useAdmin, usePoll } from '#web/features/admin/shell';
import { decimal, formatDuration, formatMbps } from '#web/shared/lib/adminFormat';
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

function LiveLabel() {
  const t = useT();
  return (
    <span className="inline-flex cursor-default items-center gap-1.5 text-[14px] font-semibold text-muted">
      {t('admin.realtime')}
    </span>
  );
}

const sampleSec = (metrics: MetricsSnapshot | null) => (metrics?.sampleIntervalMs ?? 3000) / 1000;

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
      <PageHeader.Root
        title={serverInfo?.name ?? 'KROMA'}
        suffix={t('admin.dashboardSuffix')}
        actions={<RealtimeBadge />}
      />

      <Section.Root title={t('admin.nowPlaying')} mt={28}>
        {sessions.length === 0 ? (
          <EmptyState.Root icon="player-play" title={t('admin.noPlayback')} />
        ) : (
          <div className="flex flex-col gap-3.5">
            {sessions.map((s) => (
              <NowPlayingCard
                key={s.id}
                s={s}
                avatarUrl={s.userId ? avatarByUser.get(s.userId) : null}
                onStop={() => void askStop(s)}
              />
            ))}
          </div>
        )}
      </Section.Root>

      <BandwidthSection metrics={metrics} />
      <CpuSection metrics={metrics} />
      <RamSection metrics={metrics} />

      <Section.Root
        title={t('admin.topUsers')}
        mt={28}
        actions={
          <RangeSelect
            label={t('admin.topUsers')}
            value={topDays}
            onChange={setTopDays}
            options={[7, 30, 90]}
          />
        }
      >
        {top && top.users.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {top.users.slice(0, 3).map((u) => (
              <TopUserCard key={u.username} u={u} />
            ))}
          </div>
        ) : (
          <EmptyState.Root icon="users" title={t('admin.noHistory')} />
        )}
      </Section.Root>

      <Section.Root
        title={t('admin.playHistory')}
        mt={28}
        actions={
          <RangeSelect
            label={t('admin.playHistory')}
            value={historyDays}
            onChange={setHistoryDays}
            options={[30, 90, 180]}
          />
        }
      >
        {history ? <HistoryBars buckets={history.buckets} /> : null}
      </Section.Root>
    </>
  );
}

const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

const pct = (v: number) => `${Math.round(v)} %`;

function BandwidthSection({ metrics }: Readonly<{ metrics: MetricsSnapshot | null }>) {
  const t = useT();
  const local = metrics?.series.bwLocal ?? [];
  const remote = metrics?.series.bwRemote ?? [];
  const max = Math.max(1, ...local, ...remote);
  return (
    <Section.Root title={t('admin.bandwidth')} mt={28} actions={<LiveLabel />}>
      <MetricsChart
        max={max}
        sampleSec={sampleSec(metrics)}
        formatValue={formatMbps}
        series={[
          { label: t('admin.legendRemote'), data: remote, color: CHART_SERIES.remote },
          { label: t('admin.legendLocal'), data: local, color: CHART_SERIES.local, fill: true },
        ]}
        legend={[
          { label: t('admin.legendRemote'), color: CHART_SERIES.remote },
          { label: t('admin.legendLocal'), color: CHART_SERIES.local },
        ]}
        footer={t('admin.bwAverages', {
          remote: formatMbps(avg(remote)),
          local: formatMbps(avg(local)),
        })}
      />
    </Section.Root>
  );
}

function CpuSection({ metrics }: Readonly<{ metrics: MetricsSnapshot | null }>) {
  const t = useT();
  const kroma = metrics?.series.cpuKroma ?? [];
  const sys = metrics?.series.cpuSystem ?? [];
  return (
    <Section.Root title={t('admin.cpu')} mt={28} actions={<LiveLabel />}>
      <MetricsChart
        max={100}
        sampleSec={sampleSec(metrics)}
        formatValue={pct}
        series={[
          { label: t('admin.legendSystem'), data: sys, color: CHART_SERIES.cpuSystem },
          { label: t('admin.legendKromaServer'), data: kroma, color: CHART_SERIES.kroma },
        ]}
        legend={[
          { label: t('admin.legendKromaServer'), color: CHART_SERIES.kroma },
          { label: t('admin.legendSystem'), color: CHART_SERIES.cpuSystem },
        ]}
        footer={t('admin.cpuAverages', {
          kroma: decimal(avg(kroma), 1),
          sys: decimal(avg(sys), 1),
        })}
      />
    </Section.Root>
  );
}

function RamSection({ metrics }: Readonly<{ metrics: MetricsSnapshot | null }>) {
  const t = useT();
  const kroma = metrics?.series.ramKroma ?? [];
  const sys = metrics?.series.ramSystem ?? [];
  return (
    <Section.Root title={t('admin.ram')} mt={28} actions={<LiveLabel />}>
      <MetricsChart
        max={100}
        sampleSec={sampleSec(metrics)}
        formatValue={pct}
        series={[
          { label: t('admin.legendSystem'), data: sys, color: CHART_SERIES.ramSystem },
          { label: t('admin.legendKromaServer'), data: kroma, color: CHART_SERIES.kroma },
        ]}
        legend={[
          { label: t('admin.legendKromaServer'), color: CHART_SERIES.kroma },
          { label: t('admin.legendSystem'), color: CHART_SERIES.ramSystem },
        ]}
        footer={t('admin.ramAverages', {
          kroma: decimal(avg(kroma), 2),
          sys: decimal(avg(sys), 2),
        })}
      />
    </Section.Root>
  );
}

function TopUserCard({ u }: Readonly<{ u: TopUser }>) {
  const t = useT();
  const rows = [
    { label: t('admin.films'), val: formatDuration(u.filmsMs), on: u.filmsMs >= u.tvMs },
    { label: t('admin.tv'), val: formatDuration(u.tvMs), on: u.tvMs > u.filmsMs },
  ];
  return (
    <Surface elevated pad="none" radius={16} border="border" overflow="hidden">
      <div className="flex items-center gap-3.5 px-5 py-4.5">
        <Avatar name={u.username} size={48} circle />
        <div>
          <div className="font-display text-[16px] font-bold">
            {u.plays} {u.plays > 1 ? t('admin.plays') : t('admin.play')}
          </div>
          <div className="text-[13px] font-medium text-text/55">{formatDuration(u.watchedMs)}</div>
        </div>
      </div>
      <div className="border-y border-white/5 bg-surface-2 px-5 py-2.75 text-[15px] font-bold">
        {u.username}
      </div>
      <div>
        {rows.map((r) => (
          <div
            key={r.label}
            className="flex items-center justify-between border-b border-white/4 px-5 py-2.75"
            style={{ background: r.on ? color('accentWash/16') : 'transparent' }}
          >
            <span
              className="text-[13.5px] font-semibold"
              style={{ color: color(r.on ? 'accent' : 'textMuted') }}
            >
              {r.label}
            </span>
            <span
              className="text-[13.5px] font-semibold tabular-nums"
              style={{ color: color(r.on ? 'accent' : 'textMuted') }}
            >
              {r.val}
            </span>
          </div>
        ))}
      </div>
    </Surface>
  );
}
