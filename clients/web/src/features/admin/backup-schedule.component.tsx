import { apiErrorText } from '@kromatv/client';
import type { BackupSchedule, BackupScheduleChange } from '@kromatv/client/admin';
import { type JobRun, JobKey } from '@kromatv/client/jobs';
import { useFormat, useT } from '@kromatv/ui';
import { Box, Button, Callout, ListRow, NumberField, Section, Switch, Text } from '@kromatv/ui/kit';
import { useQuery } from '@tanstack/react-query';
import { type Refusal, useBackupSchedule } from '#web/shared/lib/use-backup-schedule.hook';
import { useWebRuntime } from '#web/shared/lib/web-runtime';
import { FolderField } from '#web/shared/ui/folder-field.component';
import { RouteLink } from '#web/shared/ui/route-link.component';

const SAVE_JOB = JobKey.parse('backup.save');
const MAX_KEEP = 365;
const KEEP_WIDTH = 112;

interface RowsProps {
  schedule: BackupSchedule;
  onChange: (patch: BackupScheduleChange) => void;
}

function KeepRow({ schedule, onChange }: Readonly<RowsProps>) {
  const t = useT();
  return (
    <ListRow.Root icon="stack-2" chevron={false}>
      <ListRow.Label>{t('admin.backupScheduleKeep')}</ListRow.Label>
      <ListRow.Trailing>
        <Box w={KEEP_WIDTH}>
          <NumberField
            label={t('admin.backupScheduleKeep')}
            value={schedule.keep}
            min={1}
            max={MAX_KEEP}
            onValueChange={(keep) => onChange({ keep })}
          />
        </Box>
      </ListRow.Trailing>
    </ListRow.Root>
  );
}

function ScheduleRows({ schedule, onChange }: Readonly<RowsProps>) {
  const t = useT();
  return (
    <ListRow.Group>
      <ListRow.Root icon="archive" chevron={false}>
        <ListRow.Label>{t('admin.backupScheduleSwitch')}</ListRow.Label>
        <ListRow.Hint>{t('admin.backupScheduleHint')}</ListRow.Hint>
        <ListRow.Trailing>
          <Switch
            checked={schedule.enabled}
            onCheckedChange={(enabled) => onChange({ enabled })}
            label={t('admin.backupScheduleSwitch')}
          />
        </ListRow.Trailing>
      </ListRow.Root>
      <KeepRow schedule={schedule} onChange={onChange} />
    </ListRow.Group>
  );
}

function useLastRun(): JobRun | null {
  const { client } = useWebRuntime();
  const { data } = useQuery({
    queryKey: ['admin', 'jobs', SAVE_JOB],
    queryFn: () => client.jobs.detail(SAVE_JOB),
  });
  return data?.info.lastRun ?? null;
}

function LastBackup() {
  const t = useT();
  const fmt = useFormat();
  const run = useLastRun();
  if (run?.status === 'failed') {
    return (
      <Callout.Root tone="danger" icon="alert-triangle">
        <Callout.Title>
          {t('admin.backupScheduleLastFailed', { when: fmt.elapsed(run.startedAt) })}
        </Callout.Title>
        {run.error ? <Callout.Detail>{run.error}</Callout.Detail> : null}
      </Callout.Root>
    );
  }
  const line =
    run?.status === 'success'
      ? t('admin.backupScheduleLast', { when: fmt.elapsed(run.startedAt) })
      : t('admin.backupScheduleNone');
  return (
    <Text variant="meta" color="textDim">
      {line}
    </Text>
  );
}

function ScheduleRefusal({ refusal }: Readonly<{ refusal: Refusal | null }>) {
  const t = useT();
  if (!refusal) {
    return null;
  }
  return (
    <Callout.Root tone="danger" icon="alert-triangle">
      <Callout.Title>{apiErrorText(refusal.cause, t('admin.backupScheduleFailed'))}</Callout.Title>
    </Callout.Root>
  );
}

function ScheduleHeader() {
  const t = useT();
  return (
    <Section.Header>
      <Section.Title>{t('admin.backupScheduleTitle')}</Section.Title>
      <Section.Actions>
        <Button variant="ghost" size="sm" label={t('admin.backupScheduleWhen')} asChild>
          <RouteLink to="/admin/jobs" />
        </Button>
      </Section.Actions>
    </Section.Header>
  );
}

/** The backups the server saves by itself: the switch, the folder they go to,
 * how many it keeps, and how the last one went. */
export function BackupScheduleSection() {
  const t = useT();
  const { schedule, refusal, change } = useBackupSchedule();
  if (!schedule) {
    return null;
  }
  const save = (patch: BackupScheduleChange) => void change(patch);
  return (
    <Section.Root mt={28}>
      <ScheduleHeader />
      <Box gap={12}>
        <ScheduleRows schedule={schedule} onChange={save} />
        <FolderField
          value={schedule.folder}
          placeholder={t('admin.backupScheduleFolder')}
          onChange={(folder) => save({ folder })}
          onClear={schedule.chosen ? () => save({ folder: '' }) : undefined}
        />
        <ScheduleRefusal refusal={refusal} />
        <LastBackup />
      </Box>
    </Section.Root>
  );
}
