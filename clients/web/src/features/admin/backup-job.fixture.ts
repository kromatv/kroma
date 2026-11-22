import { JobDetail } from '@kromatv/client/jobs';

const INFO = {
  key: 'backup.save',
  name: 'Scheduled backup',
  description: '',
  category: 'maintenance',
  schedule: '0 3 * * *',
  defaultSchedule: '0 3 * * *',
  customized: false,
  enabled: true,
  running: false,
  runId: null,
  progressDone: null,
  progressTotal: null,
  nextRunAt: null,
};

const RUN = {
  id: 'backup_save-1',
  jobKey: 'backup.save',
  trigger: 'schedule',
  startedAt: 1_795_000_000_000,
  finishedAt: 1_795_000_001_000,
  durationMs: 1000,
  progressDone: null,
  progressTotal: null,
  error: null,
};

/** The backup task's detail with its last run, or none, for a test. */
export function backupJob(lastRun: { status: string; error?: string | null } | null) {
  return JobDetail.parse({
    info: { ...INFO, lastRun: lastRun && { ...RUN, ...lastRun } },
    runs: [],
  });
}
