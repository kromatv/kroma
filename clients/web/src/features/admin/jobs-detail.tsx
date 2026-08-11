// Expandable per-job detail: the recent run history (left) and the selected
// run's log lines (right). Polls `/api/admin/jobs/:key` + `/api/admin/job-runs/
// :runId/logs`; while a run is active the short poll interval makes the logs
// feel live.

import type { JobLog, JobRun, MessageKey } from '@kroma/core';
import { useT } from '@kroma/ui';
import { color, ListRow } from '@kroma/ui/kit';
import { useState } from 'react';
import { clock, dur, rel } from '#web/features/admin/jobs-format';
import { usePoll } from '#web/features/admin/shell';
import { useAuth } from '#web/shared/lib/auth';

export function JobDetailPanel({ jobKey }: Readonly<{ jobKey: string }>) {
  const t = useT();
  const { client } = useAuth();
  const { data } = usePoll(['admin', 'job', jobKey], () => client.adminJob(jobKey), 4000);
  const runs = data?.runs ?? [];

  const [selected, setSelected] = useState<string | null>(null);
  const runId = selected ?? runs[0]?.id ?? null;
  const { data: logsData } = usePoll(
    ['admin', 'jobRunLogs', runId ?? 'none'],
    () => (runId ? client.jobRunLogs(runId) : Promise.resolve({ logs: [] as JobLog[] })),
    2500,
  );
  const logs = logsData?.logs ?? [];

  return (
    <div className="grid gap-px border-t border-border bg-border md:grid-cols-[270px_1fr]">
      <div className="max-h-80 overflow-y-auto bg-surface-1 p-2.5">
        {runs.length === 0 ? (
          <div className="px-2 py-6 text-center text-[12.5px] text-dim">{t('jobs.noRuns')}</div>
        ) : (
          <ListRow.Group size="sm">
            {runs.map((r) => (
              <RunRow
                key={r.id}
                run={r}
                active={r.id === runId}
                onClick={() => setSelected(r.id)}
              />
            ))}
          </ListRow.Group>
        )}
      </div>
      <div className="max-h-80 overflow-y-auto bg-bg p-3.5 font-mono text-[12px] leading-relaxed">
        {logs.length === 0 ? (
          <div className="text-[12.5px] text-dim">{t('jobs.noLogs')}</div>
        ) : (
          logs.map((l) => <LogLine key={`${l.ts}-${l.message}`} log={l} />)
        )}
      </div>
    </div>
  );
}

function RunRow({
  run,
  active,
  onClick,
}: Readonly<{ run: JobRun; active: boolean; onClick: () => void }>) {
  const t = useT();
  const status = t(`jobs.status.${run.status}` as MessageKey);
  return (
    <ListRow.Root size="sm" selected={active} chevron={false} onPress={onClick} label={status}>
      <ListRow.Leading>
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ background: statusColor(run.status) }}
        />
      </ListRow.Leading>
      <ListRow.Label>
        {status} · {t(`jobs.trigger.${run.trigger}` as MessageKey)}
      </ListRow.Label>
      <ListRow.Hint>
        {rel(run.startedAt)}
        {run.durationMs != null ? ` · ${dur(run.durationMs)}` : ''}
      </ListRow.Hint>
    </ListRow.Root>
  );
}

function logColor(level: string): string {
  if (level === 'error') return color('danger');
  if (level === 'warn') return color('accent');
  return color('glyph');
}

function LogLine({ log }: Readonly<{ log: JobLog }>) {
  const color = logColor(log.level);
  return (
    <div className="flex gap-2.5">
      <span className="shrink-0 text-text/35">{clock(log.ts)}</span>
      <span className="whitespace-pre-wrap wrap-break-word" style={{ color }}>
        {log.message}
      </span>
    </div>
  );
}

function statusColor(status: string): string {
  if (status === 'success') return color('success');
  if (status === 'failed') return color('danger');
  if (status === 'running') return color('accent');
  return color('glyph');
}
