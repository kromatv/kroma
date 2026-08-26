// Expandable per-job detail: the recent run history (left) and the selected
// run's log lines (right). Polls `/api/admin/jobs/:key` + `/api/admin/job-runs/
// :runId/logs`; while a run is active the short poll interval makes the logs
// feel live.

import type { JobLog, JobRun, MessageKey } from '@kroma/core';
import { useLocale, useT } from '@kroma/ui';
import { Box, type ColorValue, Divider, ListRow, Row, Text } from '@kroma/ui/kit';
import { type CSSProperties, useState } from 'react';
import { clock, dur, rel } from '#web/features/admin/jobs-format';
import { usePoll } from '#web/features/admin/shell';
import { useAuth } from '#web/shared/lib/auth';

// A pane that scrolls: `overflow-y` and a capped height have no React Native
// spelling, so the pane stays a real element.
const PANE: CSSProperties = { maxHeight: 320, overflowY: 'auto' };

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
    <>
      <Divider />
      <Box row={{ base: false, md: true }}>
        <Box w={{ base: '100%', md: 270 }} shrink={0} bg="surface1">
          <div style={PANE}>
            <Box p={10}>
              {runs.length === 0 ? (
                <Text variant="meta" color="textDim" textAlign="center" px={8} py={24}>
                  {t('jobs.noRuns')}
                </Text>
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
            </Box>
          </div>
        </Box>
        <Box flex minW={0} bg="bg">
          <div style={PANE}>
            <Box p={14} gap={2}>
              {logs.length === 0 ? (
                <Text variant="meta" color="textDim">
                  {t('jobs.noLogs')}
                </Text>
              ) : (
                logs.map((l) => <LogLine key={`${l.ts}-${l.message}`} log={l} />)
              )}
            </Box>
          </div>
        </Box>
      </Box>
    </>
  );
}

function RunRow({
  run,
  active,
  onClick,
}: Readonly<{ run: JobRun; active: boolean; onClick: () => void }>) {
  const t = useT();
  const locale = useLocale();
  const status = t(`jobs.status.${run.status}` as MessageKey);
  return (
    <ListRow.Root size="sm" selected={active} chevron={false} onPress={onClick}>
      <ListRow.Leading>
        <Box w={8} h={8} shrink={0} radius="circle" bg={statusColor(run.status)} />
      </ListRow.Leading>
      <ListRow.Label>
        {status} · {t(`jobs.trigger.${run.trigger}` as MessageKey)}
      </ListRow.Label>
      <ListRow.Hint>
        {rel(run.startedAt, locale)}
        {run.durationMs != null ? ` · ${dur(run.durationMs)}` : ''}
      </ListRow.Hint>
    </ListRow.Root>
  );
}

function logColor(level: string): ColorValue {
  if (level === 'error') return 'danger';
  if (level === 'warn') return 'accent';
  return 'glyph';
}

function LogLine({ log }: Readonly<{ log: JobLog }>) {
  const locale = useLocale();
  return (
    <Row align="flex-start" gap={10}>
      <Text variant="meta" font="mono" color="textDim" shrink={0}>
        {clock(log.ts, locale)}
      </Text>
      <Text variant="meta" font="mono" color={logColor(log.level)} flex={1}>
        {log.message}
      </Text>
    </Row>
  );
}

function statusColor(status: string): ColorValue {
  if (status === 'success') return 'success';
  if (status === 'failed') return 'danger';
  if (status === 'running') return 'accent';
  return 'glyph';
}
