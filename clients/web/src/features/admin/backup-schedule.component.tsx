import { apiErrorText } from '@kromatv/client';
import type { BackupSchedule, BackupScheduleChange } from '@kromatv/client/admin';
import { JobKey } from '@kromatv/client/jobs';
import { useFormat, useT } from '@kromatv/ui';
import {
  Box,
  Button,
  Callout,
  type IconName,
  ListRow,
  NumberField,
  Section,
  Switch,
  Text,
} from '@kromatv/ui/kit';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { type LastBackup, lastBackup } from '#web/features/admin/last-backup';
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

interface SettingRowProps {
  icon: IconName;
  label: string;
  hint?: string;
  children: ReactNode;
}

function SettingRow({ icon, label, hint, children }: Readonly<SettingRowProps>) {
  return (
    <ListRow.Root icon={icon} chevron={false}>
      <ListRow.Label>{label}</ListRow.Label>
      {hint ? <ListRow.Hint>{hint}</ListRow.Hint> : null}
      <ListRow.Trailing>{children}</ListRow.Trailing>
    </ListRow.Root>
  );
}

function ScheduleRows({ schedule, onChange }: Readonly<RowsProps>) {
  const t = useT();
  const enabled = t('admin.backupScheduleSwitch');
  const keep = t('admin.backupScheduleKeep');
  return (
    <ListRow.Group>
      <SettingRow icon="archive" label={enabled} hint={t('admin.backupScheduleHint')}>
        <Switch
          checked={schedule.enabled}
          onCheckedChange={(on) => onChange({ enabled: on })}
          label={enabled}
        />
      </SettingRow>
      <SettingRow icon="stack-2" label={keep}>
        <Box w={KEEP_WIDTH}>
          <NumberField
            label={keep}
            value={schedule.keep}
            min={1}
            max={MAX_KEEP}
            onValueChange={(count) => onChange({ keep: count })}
          />
        </Box>
      </SettingRow>
    </ListRow.Group>
  );
}

function useLastBackup(): LastBackup {
  const { client } = useWebRuntime();
  const { data } = useQuery({
    queryKey: ['admin', 'jobs', SAVE_JOB],
    queryFn: () => client.jobs.detail(SAVE_JOB),
  });
  return lastBackup(data);
}

function FailedBackup({ at, error }: Readonly<{ at: number; error: string | null }>) {
  const t = useT();
  const fmt = useFormat();
  return (
    <Callout.Root tone="danger" icon="alert-triangle">
      <Callout.Title>
        {t('admin.backupScheduleLastFailed', { when: fmt.elapsed(at) })}
      </Callout.Title>
      {error ? <Callout.Detail>{error}</Callout.Detail> : null}
    </Callout.Root>
  );
}

function LastBackupLine() {
  const t = useT();
  const fmt = useFormat();
  const last = useLastBackup();
  if (last.kind === 'failed') {
    return <FailedBackup at={last.at} error={last.error} />;
  }
  return (
    <Text variant="meta" color="textDim">
      {last.kind === 'saved'
        ? t('admin.backupScheduleLast', { when: fmt.elapsed(last.at) })
        : t('admin.backupScheduleNone')}
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
        <LastBackupLine />
      </Box>
    </Section.Root>
  );
}
