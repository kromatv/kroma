// Admin "Tâches" console: every background job with its schedule, next/last run
// and live progress, plus run-now / cancel / enable / edit-schedule actions and
// an expandable run-history + log panel. Mirrors the server's job registry
// (`services::jobs`) over `/api/admin/jobs`.

import { type JobInfo, KromaEvents, type MessageKey } from '@kroma/core';
import { useT } from '@kroma/ui';
import { Button, Chip, EmptyState, IconButton, Txt } from '@kroma/ui/kit';
import { IconBolt, IconClock } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { JobDetailPanel } from '#web/features/admin/jobs-detail';
import { dur, rel } from '#web/features/admin/jobs-format';
import { ScheduleModal } from '#web/features/admin/jobs-schedule';
import { PageHeader, useAsyncAction, useCap, usePoll } from '#web/features/admin/shell';
import { C, Card, Pill, ProgressBar, Section, Toggle } from '#web/features/admin/ui';
import { apiBase } from '#web/shared/lib/api';
import { useAuth } from '#web/shared/lib/auth';
import { TableSkeleton } from '#web/shared/ui';

/** Cron strings read best in a monospace, which the kit chip's label is not. */
const CRON = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 11.5,
  fontWeight: '600',
} as const;

/** Live progress pushed over the WS bus, keyed by job key. */
type LiveProgress = Record<string, { done: number; total: number }>;

export function JobsPage() {
  const t = useT();
  const { client } = useAuth();
  const { data, reload } = usePoll(['admin', 'jobs'], () => client.adminJobs(), 6000);
  const [live, setLive] = useState<LiveProgress>({});

  // A page-scoped event stream for smooth progress + immediate reloads on
  // start/finish (the shell's stream only bumps the refetch `tick`).
  useEffect(() => {
    const ev = new KromaEvents(apiBase(), {
      onEvent: (e) => {
        if (e.type === 'job.progress') {
          setLive((s) => ({ ...s, [e.key]: { done: e.done, total: e.total } }));
        } else if (e.type === 'job.started' || e.type === 'job.finished') {
          reload();
        }
      },
    });
    ev.connect();
    return () => ev.close();
  }, [reload]);

  // Pipeline stages live in their own "Pipeline" console, not the general task
  // list, so filter them out here.
  const jobs = (data?.jobs ?? []).filter((j) => j.category !== 'pipeline');
  const categories = [...new Set(jobs.map((j) => j.category))];

  return (
    <>
      <PageHeader title={t('admin.jobsTitle')} subtitle={t('admin.jobsSub')} realtime />
      {data === null ? <TableSkeleton rows={6} /> : null}
      {categories.map((cat) => (
        <Section key={cat} title={t(`jobs.cat.${cat}` as MessageKey)}>
          <div className="flex flex-col gap-3.5">
            {jobs
              .filter((j) => j.category === cat)
              .map((j) => (
                <JobCard key={j.key} job={j} live={live[j.key]} reload={reload} />
              ))}
          </div>
        </Section>
      ))}
      {data && jobs.length === 0 ? <EmptyState icon="clock-bolt" title={t('jobs.empty')} /> : null}
    </>
  );
}

function JobMeta({ job, onEdit }: Readonly<{ job: JobInfo; onEdit?: () => void }>) {
  const t = useT();
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2.5">
        <span className="font-display text-[16px] font-bold">{t(job.name as MessageKey)}</span>
        <StatusPill job={job} />
      </div>
      <div className="mt-0.75 text-[12.5px] text-dim">{t(job.description as MessageKey)}</div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-text/55">
        <ScheduleChip job={job} onEdit={onEdit} />
        {job.schedule && job.enabled && job.nextRunAt ? (
          <span className="inline-flex items-center gap-1.5">
            <IconClock size={13} stroke={1.8} />
            {t('jobs.next')} {rel(job.nextRunAt)}
          </span>
        ) : null}
        <LastRun job={job} />
      </div>
    </div>
  );
}

function JobActions({
  job,
  canManage,
  busy,
  open,
  onRun,
  onCancel,
  onToggle,
  onToggleOpen,
}: Readonly<{
  job: JobInfo;
  canManage: boolean;
  busy: boolean;
  open: boolean;
  onRun: () => void;
  onCancel: () => void;
  onToggle: (enabled: boolean) => void;
  onToggleOpen: () => void;
}>) {
  const t = useT();
  return (
    <div className="flex shrink-0 items-center gap-3">
      {job.schedule ? (
        <Toggle on={job.enabled} onChange={canManage ? onToggle : undefined} />
      ) : null}
      {job.running ? (
        <Button
          variant="danger"
          size="sm"
          icon="player-stop"
          label={t('jobs.cancel')}
          onPress={onCancel}
          disabled={!canManage || busy}
        />
      ) : (
        <Button
          variant="glass"
          size="sm"
          icon="player-play"
          label={t('jobs.runNow')}
          onPress={onRun}
          disabled={!canManage || busy}
        />
      )}
      <IconButton
        variant="ghost"
        size={30}
        glyph={18}
        icon={open ? 'chevron-up' : 'chevron-down'}
        label={t('jobs.history')}
        onPress={onToggleOpen}
      />
    </div>
  );
}

function JobProgress({ prog }: Readonly<{ prog: { done: number; total: number } }>) {
  const t = useT();
  return (
    <div className="px-5.5 pb-4">
      {prog.total > 0 ? (
        <div className="flex items-center gap-3">
          <ProgressBar pct={(prog.done / prog.total) * 100} color={C.accent} />
          <span className="shrink-0 text-[12px] font-semibold tabular-nums text-text/60">
            {prog.done}/{prog.total}
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-[12.5px] font-semibold text-accent">
          <IconBolt size={14} stroke={2} />
          {t('jobs.runningNow')}
        </div>
      )}
    </div>
  );
}

function JobCard({
  job,
  live,
  reload,
}: Readonly<{ job: JobInfo; live?: { done: number; total: number }; reload: () => void }>) {
  const { client } = useAuth();
  const canManage = useCap('settings.manage');
  const action = useAsyncAction();
  const [open, setOpen] = useState(false);

  const run = () => action.run(() => client.runJob(job.key).then(reload));
  const cancel = () => action.run(() => client.cancelJob(job.key).then(reload));
  const toggle = (enabled: boolean) =>
    action.run(() => client.updateJob(job.key, { enabled }).then(reload));
  const editSchedule = async () => {
    if (await ScheduleModal.call({ job })) reload();
  };

  const prog = job.running
    ? (live ?? { done: job.progressDone ?? 0, total: job.progressTotal ?? 0 })
    : null;

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-4 px-5.5 py-4.5">
        <JobMeta job={job} onEdit={canManage ? () => void editSchedule() : undefined} />
        <JobActions
          job={job}
          canManage={canManage}
          busy={action.busy}
          open={open}
          onRun={run}
          onCancel={cancel}
          onToggle={toggle}
          onToggleOpen={() => setOpen((o) => !o)}
        />
      </div>

      {prog ? <JobProgress prog={prog} /> : null}

      {action.error ? (
        <div className="px-5.5 pb-3 text-[12.5px] font-semibold text-[#E8536A]">{action.error}</div>
      ) : null}

      {open ? <JobDetailPanel jobKey={job.key} /> : null}
    </Card>
  );
}

function StatusPill({ job }: Readonly<{ job: JobInfo }>) {
  const t = useT();
  if (job.running) {
    return (
      <Pill color={C.accent} bg="rgba(244,182,66,.14)">
        {t('jobs.status.running')}
      </Pill>
    );
  }
  const status = job.lastRun?.status;
  if (!status) return null;
  const { color, bg } = STATUS_STYLE[status] ?? STATUS_FALLBACK;
  return (
    <Pill color={color} bg={bg}>
      {t(`jobs.status.${status}` as MessageKey)}
    </Pill>
  );
}

function ScheduleChip({ job, onEdit }: Readonly<{ job: JobInfo; onEdit?: () => void }>) {
  const t = useT();
  const label = job.schedule ?? t('jobs.manual');
  return (
    <Chip variant="surface" icon="calendar-clock" onPress={onEdit} disabled={!onEdit}>
      <Txt style={CRON} color="textMuted">
        {label}
      </Txt>
      {job.customized ? <Txt color="accent">•</Txt> : null}
    </Chip>
  );
}

function LastRun({ job }: Readonly<{ job: JobInfo }>) {
  const t = useT();
  const last = job.lastRun;
  if (!last || job.running) return null;
  return (
    <span className="inline-flex items-center gap-1.5">
      {t('jobs.last')} {rel(last.startedAt)}
      {last.durationMs != null ? ` · ${dur(last.durationMs)}` : ''}
    </span>
  );
}

const STATUS_FALLBACK = { color: '#9AA0AA', bg: 'rgba(255,255,255,.06)' };
const STATUS_STYLE: Record<string, { color: string; bg: string }> = {
  success: { color: C.green, bg: 'rgba(70,208,141,.13)' },
  failed: { color: C.red, bg: 'rgba(232,83,106,.13)' },
  cancelled: STATUS_FALLBACK,
  running: { color: C.accent, bg: 'rgba(244,182,66,.14)' },
};
