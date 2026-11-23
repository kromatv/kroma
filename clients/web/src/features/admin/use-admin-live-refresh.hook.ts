import { KromaEvents } from '@kromatv/client/events';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { apiBase } from '#web/shared/lib/api';
import { useKromaClient } from '#web/shared/lib/web-runtime';

const WINDOW_MS = 1500;

const FRAMES: ReadonlySet<string> = new Set([
  'job.log',
  'job.progress',
  'download.progress',
  'downloads.stats',
  'module.op.progress',
  'module.op.done',
  'pipeline.stats',
  'enrich.progress',
  'probe.progress',
  'playback.updated',
  'cast.position',
]);

/** Refetches every `['admin']` query at most once per window when the server announces a change, and never for the frames a running job, stage, download or player sends every few seconds: the page that shows those listens to them itself. */
export function useAdminLiveRefresh(): void {
  const eventClient = useKromaClient();
  const queryClient = useQueryClient();

  useEffect(() => {
    let pending: ReturnType<typeof setTimeout> | null = null;
    const ev = new KromaEvents(apiBase(), {
      token: () => eventClient.sessionToken,
      refresh: () => eventClient.refreshSession(),
      onEvent: (e) => {
        if (pending || FRAMES.has(e.type)) {
          return;
        }
        pending = setTimeout(() => {
          pending = null;
          void queryClient.invalidateQueries({ queryKey: ['admin'] });
        }, WINDOW_MS);
      },
    });
    ev.connect();
    return () => {
      if (pending) {
        clearTimeout(pending);
      }
      ev.close();
    };
  }, [queryClient, eventClient]);
}
