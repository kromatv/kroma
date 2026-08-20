// Admin "Tâches" console: every background job with its schedule, next/last run
// and live progress, plus run-now / cancel / enable / edit-schedule actions and
// an expandable run-history + log panel. Mirrors the server's job registry
// (`services::jobs`) over `/api/admin/jobs`.

import { KromaEvents, type MessageKey } from '@kroma/core';
import { useT } from '@kroma/ui';
import { Box, EmptyState, Section } from '@kroma/ui/kit';
import { useEffect, useState } from 'react';
import { JobCard } from '#web/features/admin/job-card';
import { RealtimeBadge } from '#web/features/admin/realtime-badge';
import { PageHeader, usePoll } from '#web/features/admin/shell';
import { apiBase } from '#web/shared/lib/api';
import { useAuth } from '#web/shared/lib/auth';
import { TableSkeleton } from '#web/shared/ui';

// Progress pushed over the WS bus, keyed by job key.
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
      <PageHeader.Root>
        <PageHeader.Title>{t('admin.jobsTitle')}</PageHeader.Title>
        <PageHeader.Subtitle>{t('admin.jobsSub')}</PageHeader.Subtitle>
        <PageHeader.Actions>
          <RealtimeBadge />
        </PageHeader.Actions>
      </PageHeader.Root>
      {data === null ? <TableSkeleton rows={6} /> : null}
      {categories.map((cat) => (
        <Section.Root key={cat} mt={28}>
          <Section.Header>
            <Section.Title>{t(`jobs.cat.${cat}` as MessageKey)}</Section.Title>
          </Section.Header>
          <Box gap={14}>
            {jobs
              .filter((j) => j.category === cat)
              .map((j) => (
                <JobCard key={j.key} job={j} live={live[j.key]} reload={reload} />
              ))}
          </Box>
        </Section.Root>
      ))}
      {data && jobs.length === 0 ? (
        <EmptyState.Root icon="clock-bolt">
          <EmptyState.Title>{t('jobs.empty')}</EmptyState.Title>
        </EmptyState.Root>
      ) : null}
    </>
  );
}
