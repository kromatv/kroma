import type { JobInfo, MessageKey } from '@kroma/core';
import { TABULAR } from '@kroma/module-sdk';
import { useT } from '@kroma/ui';
import {
  Badge,
  type BadgeTone,
  Box,
  Button,
  Chip,
  Icon,
  IconButton,
  Progress,
  Row,
  Surface,
  Switch,
  Text,
} from '@kroma/ui/kit';
import { useState } from 'react';
import { JobDetailPanel } from '#web/features/admin/jobs-detail';
import { dur, rel } from '#web/features/admin/jobs-format';
import { ScheduleModal } from '#web/features/admin/jobs-schedule';
import { useAsyncAction, useCap } from '#web/features/admin/shell';
import { useAuth } from '#web/shared/lib/auth';

// Cron strings read best in a monospace, which the kit chip's label is not.
const CRON = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 11.5,
  fontWeight: '600',
} as const;

function JobMeta({ job, onEdit }: Readonly<{ job: JobInfo; onEdit?: () => void }>) {
  const t = useT();
  return (
    <Box minW={0}>
      <Row gap={10}>
        <Text variant="title">{t(job.name as MessageKey)}</Text>
        <StatusPill job={job} />
      </Row>
      <Text variant="meta" color="textDim" mt={3}>
        {t(job.description as MessageKey)}
      </Text>
      <Row wrap gap={8} mt={8}>
        <ScheduleChip job={job} onEdit={onEdit} />
        {job.schedule && job.enabled && job.nextRunAt ? (
          <Row gap={6}>
            <Icon name="clock" size={13} thickness={1.8} color="textMuted" />
            <Text variant="meta" color="textMuted">
              {t('jobs.next')} {rel(job.nextRunAt)}
            </Text>
          </Row>
        ) : null}
        <LastRun job={job} />
      </Row>
    </Box>
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
    <Row shrink={0} gap={12}>
      {job.schedule ? (
        <Switch
          checked={job.enabled}
          onCheckedChange={canManage ? onToggle : undefined}
          label={t(job.name as MessageKey)}
        />
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
        icon={open ? 'chevron-up' : 'chevron-down'}
        label={t('jobs.history')}
        onPress={onToggleOpen}
      />
    </Row>
  );
}

function JobProgress({ prog }: Readonly<{ prog: { done: number; total: number } }>) {
  const t = useT();
  return (
    <Box px={22} pb={16}>
      {prog.total > 0 ? (
        <Row gap={12}>
          <Box flex>
            <Progress value={prog.done / prog.total} rounded />
          </Box>
          <Text variant="meta" color="textMuted" shrink={0} style={TABULAR}>
            {prog.done}/{prog.total}
          </Text>
        </Row>
      ) : (
        <Row gap={8}>
          <Icon name="bolt" size={14} thickness={2} color="accent" />
          <Text variant="meta" color="accentText">
            {t('jobs.runningNow')}
          </Text>
        </Row>
      )}
    </Box>
  );
}

export function JobCard({
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
    <Surface elevated pad="none" radius="xl" border="border" overflow="hidden">
      <Row between gap={16} px={22} py={18}>
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
      </Row>

      {prog ? <JobProgress prog={prog} /> : null}

      {action.error ? (
        <Box px={22} pb={12}>
          <Text variant="meta" color="danger">
            {action.error}
          </Text>
        </Box>
      ) : null}

      {open ? <JobDetailPanel jobKey={job.key} /> : null}
    </Surface>
  );
}

function StatusPill({ job }: Readonly<{ job: JobInfo }>) {
  const t = useT();
  if (job.running) {
    return <Badge tone="warning">{t('jobs.status.running')}</Badge>;
  }
  const status = job.lastRun?.status;
  if (!status) return null;
  return (
    <Badge tone={STATUS_TONE[status] ?? 'neutral'}>
      {t(`jobs.status.${status}` as MessageKey)}
    </Badge>
  );
}

function ScheduleChip({ job, onEdit }: Readonly<{ job: JobInfo; onEdit?: () => void }>) {
  const t = useT();
  const label = job.schedule ?? t('jobs.manual');
  return (
    <Chip variant="surface" icon="calendar-clock" onPress={onEdit} disabled={!onEdit}>
      <Text style={CRON} color="textMuted">
        {label}
      </Text>
      {job.customized ? <Text color="accent">•</Text> : null}
    </Chip>
  );
}

function LastRun({ job }: Readonly<{ job: JobInfo }>) {
  const t = useT();
  const last = job.lastRun;
  if (!last || job.running) return null;
  return (
    <Text variant="meta" color="textMuted">
      {t('jobs.last')} {rel(last.startedAt)}
      {last.durationMs != null ? ` · ${dur(last.durationMs)}` : ''}
    </Text>
  );
}

const STATUS_TONE: Record<string, BadgeTone> = {
  success: 'success',
  failed: 'danger',
  cancelled: 'neutral',
  running: 'warning',
};
