import {
  KromaEvents,
  type MediaRequest,
  posterColors,
  type ServerEvent,
  sizedImageUrl,
} from '@kroma/core';
import type { DownloadProgressEvent } from '@kroma/module-torrents/schemas';
import { useLocale, useT } from '@kroma/ui';
import { Button, EmptyState, IconButton } from '@kroma/ui/kit';
import { IconCalendarClock } from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { RequestStatusChip } from '#web/features/requests/request-status-chip';
import { seasonsSummary } from '#web/features/requests/status';
import { apiBase } from '#web/shared/lib/api';
import { useAuth } from '#web/shared/lib/auth';
import { userQueries } from '#web/shared/lib/queries';
import { Image, PAGE_MAIN, PAGE_SUBTITLE, PAGE_TITLE, Skeleton } from '#web/shared/ui';

export function MyRequestsPage() {
  const t = useT();
  const { client } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const requestsQuery = userQueries.myRequests();
  const { data: requests, isPending } = useQuery({
    ...requestsQuery,
    refetchInterval: 15000,
    select: (v) => v.requests,
  });
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const lastReloadRef = useRef(0);
  useEffect(() => {
    const ev = new KromaEvents<ServerEvent | DownloadProgressEvent>(apiBase(), {
      onEvent: (e) => {
        if (e.type === 'request.updated') {
          const now = Date.now();
          if (now - lastReloadRef.current > 1200) {
            lastReloadRef.current = now;
            void queryClient.invalidateQueries({ queryKey: requestsQuery.queryKey });
          }
        } else if (e.type === 'download.progress' && e.requestId) {
          setProgress((p) => ({ ...p, [e.requestId as string]: e.progress }));
        }
      },
    });
    ev.connect();
    return () => ev.close();
  }, [queryClient, requestsQuery.queryKey]);

  const cancel = (req: MediaRequest) => {
    setBusyId(req.id);
    client
      .deleteRequest(req.id)
      .then(() => queryClient.invalidateQueries({ queryKey: requestsQuery.queryKey }))
      .catch(() => undefined)
      .finally(() => setBusyId(null));
  };

  return (
    <main className={PAGE_MAIN}>
      <h1 className={PAGE_TITLE}>{t('requests.myTitle')}</h1>
      <p className={PAGE_SUBTITLE}>{t('requests.mySubtitle')}</p>

      {isPending ? (
        <div className="mt-6 flex flex-col gap-2.5">
          {Array.from({ length: 4 }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length placeholder rows
            <Skeleton key={i} h={92} radius={16} />
          ))}
        </div>
      ) : null}

      {requests?.length === 0 ? (
        <EmptyState.Root
          icon="inbox"
          title={t('requests.myEmpty')}
          actions={
            <Button
              size="sm"
              label={t('requests.myEmptyCta')}
              onPress={() => navigate({ to: '/search' })}
            />
          }
        />
      ) : null}

      <div className="mt-6 flex flex-col gap-2.5">
        {(requests ?? []).map((req) => (
          <RequestRow
            key={req.id}
            req={req}
            progress={progress[req.id]}
            busy={busyId === req.id}
            onCancel={() => cancel(req)}
            onOpen={() => {
              if (req.status === 'available') {
                navigate({ to: '/search' });
              } else {
                navigate({
                  to: '/discover/$type/$tmdbId',
                  params: {
                    type: req.kind === 'show' ? 'tv' : 'movie',
                    tmdbId: String(req.tmdbId),
                  },
                });
              }
            }}
          />
        ))}
      </div>
    </main>
  );
}

function RequestRow({
  req,
  progress,
  busy,
  onCancel,
  onOpen,
}: Readonly<{
  req: MediaRequest;
  progress?: number;
  busy: boolean;
  onCancel: () => void;
  onOpen: () => void;
}>) {
  const t = useT();
  const locale = useLocale();
  const [c1, c2] = posterColors(String(req.tmdbId));
  const poster = sizedImageUrl(req.posterUrl, 92);
  const seasons = seasonsSummary(req.seasons);
  const today = new Date().toISOString().slice(0, 10);
  const upcomingKey = req.kind === 'show' ? 'requests.nextEpisodeDate' : 'requests.availableDate';
  const upcoming =
    req.nextAirDate && req.nextAirDate >= today
      ? t(upcomingKey, {
          date: new Date(`${req.nextAirDate}T00:00:00`).toLocaleDateString(locale),
        })
      : null;

  return (
    <div className="flex items-center gap-4 rounded-2xl border border-border bg-surface-1 p-3.5">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-4 text-left"
      >
        <div
          className="relative h-[68px] w-[46px] flex-[0_0_46px] overflow-hidden rounded-lg"
          style={{ background: `linear-gradient(158deg, ${c1}, ${c2})` }}
        >
          <Image src={poster} fit="cover" fill />
        </div>
        <div className="min-w-0">
          <div className="truncate text-[15px] font-bold">{req.title}</div>
          <div className="mt-0.5 text-[12.5px] font-medium text-dim">
            {[
              req.year ? String(req.year) : '',
              req.kind === 'show' ? (seasons ?? t('requests.allSeasons')) : '',
            ]
              .filter(Boolean)
              .join(' · ')}
          </div>
          {upcoming ? (
            <div className="mt-1 inline-flex items-center gap-1 text-[12px] font-semibold text-accent">
              <IconCalendarClock size={13} stroke={1.9} />
              {upcoming}
            </div>
          ) : null}
          {req.note ? (
            <div className="mt-1 text-[12px] font-semibold text-danger-hover">{req.note}</div>
          ) : null}
        </div>
      </button>
      <RequestStatusChip status={req.status} progress={progress ?? req.progress ?? null} />
      {req.status === 'pending' ? (
        <IconButton
          control="sm"
          icon="x"
          label={t('requests.cancel')}
          onPress={onCancel}
          disabled={busy}
        />
      ) : null}
    </div>
  );
}
