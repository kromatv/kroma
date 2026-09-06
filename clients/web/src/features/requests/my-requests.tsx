import { KromaEvents, type ServerEvent } from '@kroma/client/events';
import type { DownloadProgressEvent, MediaRequest } from '@kroma/client/requests';
import { useLocale, useT } from '@kroma/ui';
import { Box, Button, EmptyState, Icon, IconButton, PageHeader, Row, Text } from '@kroma/ui/kit';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import type { ViewProps } from 'react-native';
import { RequestCard, RequestCardSkeleton } from '#web/features/requests/request-card';
import { apiBase } from '#web/shared/lib/api';
import { useAuth } from '#web/shared/lib/auth';
import { userQueries } from '#web/shared/lib/queries';
import { requestStatusMeta, seasonsSummary } from '#web/shared/lib/request-status';
import { PageFrame } from '#web/shared/ui';
import { RequestStatusChip } from '#web/shared/ui/request-status-chip';
import { RouteLink } from '#web/shared/ui/route-link';

export function MyRequestsPage() {
  const t = useT();
  const { client } = useAuth();
  const queryClient = useQueryClient();
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
    client.requests
      .delete(req.id)
      .then(() => queryClient.invalidateQueries({ queryKey: requestsQuery.queryKey }))
      .catch(() => undefined)
      .finally(() => setBusyId(null));
  };

  return (
    <PageFrame>
      <PageHeader.Root>
        <PageHeader.Title>{t('requests.myTitle')}</PageHeader.Title>
        <PageHeader.Subtitle>{t('requests.mySubtitle')}</PageHeader.Subtitle>
      </PageHeader.Root>

      {isPending ? <RequestCardSkeleton rows={4} /> : null}

      {requests?.length === 0 ? (
        <EmptyState.Root icon="inbox">
          <EmptyState.Title>{t('requests.myEmpty')}</EmptyState.Title>
          <EmptyState.Actions>
            <Button size="sm" label={t('requests.myEmptyCta')} asChild>
              <RouteLink to="/search" search={{ q: '', type: 'all' }} />
            </Button>
          </EmptyState.Actions>
        </EmptyState.Root>
      ) : null}

      <Box mt={24} gap={10}>
        {(requests ?? []).map((req) => (
          <RequestRow
            key={req.id}
            req={req}
            progress={progress[req.id]}
            busy={busyId === req.id}
            onCancel={() => cancel(req)}
          />
        ))}
      </Box>
    </PageFrame>
  );
}

// The rest is what the focusable around it hands its host: the row's paint,
// its ref and its handlers all have to reach the anchor itself.
function RequestLink({
  req,
  children,
  ...link
}: Readonly<{ req: MediaRequest; children?: ReactNode } & ViewProps>) {
  if (req.status === 'available') {
    return (
      <RouteLink to="/search" search={{ q: '', type: 'all' }} {...link}>
        {children}
      </RouteLink>
    );
  }
  return (
    <RouteLink
      to="/discover/$type/$tmdbId"
      params={{ type: req.kind === 'show' ? 'tv' : 'movie', tmdbId: String(req.tmdbId) }}
      {...link}
    >
      {children}
    </RouteLink>
  );
}

function RequestRow({
  req,
  progress,
  busy,
  onCancel,
}: Readonly<{
  req: MediaRequest;
  progress?: number;
  busy: boolean;
  onCancel: () => void;
}>) {
  const t = useT();
  const locale = useLocale();
  const seasons = seasonsSummary(req.seasons);
  const today = new Date().toISOString().slice(0, 10);
  const upcomingKey = req.kind === 'show' ? 'requests.nextEpisodeDate' : 'requests.availableDate';
  const upcoming =
    req.nextAirDate && req.nextAirDate >= today
      ? t(upcomingKey, {
          date: new Date(`${req.nextAirDate}T00:00:00`).toLocaleDateString(locale),
        })
      : null;

  // The status rides INSIDE the control: the whole row is the one press target,
  // so a chip parked beside it would leave two thirds of the card dead and ring
  // only the part it did not cover. It joins the label rather than being read
  // separately, which is what a row announcing "Mutiny, approved" wants.
  return (
    <RequestCard
      label={`${req.title} · ${t(requestStatusMeta(req.status).labelKey)}`}
      tmdbId={req.tmdbId}
      posterUrl={req.posterUrl}
      title={req.title}
      meta={
        <>
          <Text variant="meta" color="textDim" mt={2}>
            {[
              req.year ? String(req.year) : '',
              req.kind === 'show' ? (seasons ?? t('requests.allSeasons')) : '',
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
          {upcoming ? (
            <Row gap={4} mt={4}>
              <Icon name="calendar-clock" size={13} thickness={1.9} color="accent" />
              <Text variant="meta" color="accent">
                {upcoming}
              </Text>
            </Row>
          ) : null}
          {req.note ? (
            <Text variant="meta" color="dangerHover" mt={4}>
              {req.note}
            </Text>
          ) : null}
        </>
      }
      trailing={
        <RequestStatusChip status={req.status} progress={progress ?? req.progress ?? null} />
      }
      aside={
        req.status === 'pending' ? (
          <IconButton
            control="sm"
            icon="x"
            label={t('requests.cancel')}
            onPress={onCancel}
            disabled={busy}
          />
        ) : null
      }
      link={<RequestLink req={req} />}
    />
  );
}
