import {
  type DownloadProgressEvent,
  KromaEvents,
  type MediaRequest,
  posterColors,
  type ServerEvent,
  sizedImageUrl,
} from '@kroma/core';
import { useLocale, useT } from '@kroma/ui';
import {
  Box,
  Button,
  EmptyState,
  Focusable,
  Icon,
  IconButton,
  Img,
  PageHeader,
  Row,
  Surface,
  styles,
  Text,
} from '@kroma/ui/kit';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { apiBase } from '#web/shared/lib/api';
import { useAuth } from '#web/shared/lib/auth';
import { userQueries } from '#web/shared/lib/queries';
import { requestStatusMeta, seasonsSummary } from '#web/shared/lib/request-status';
import { PageFrame, Skeleton } from '#web/shared/ui';
import { RequestStatusChip } from '#web/shared/ui/request-status-chip';

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
    <PageFrame>
      <PageHeader.Root>
        <PageHeader.Title>{t('requests.myTitle')}</PageHeader.Title>
        <PageHeader.Subtitle>{t('requests.mySubtitle')}</PageHeader.Subtitle>
      </PageHeader.Root>

      {isPending ? (
        <Box mt={24} gap={10}>
          {Array.from({ length: 4 }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length placeholder rows
            <Skeleton key={i} h={92} radius={16} />
          ))}
        </Box>
      ) : null}

      {requests?.length === 0 ? (
        <EmptyState.Root icon="inbox">
          <EmptyState.Title>{t('requests.myEmpty')}</EmptyState.Title>
          <EmptyState.Actions>
            <Button
              size="sm"
              label={t('requests.myEmptyCta')}
              onPress={() => navigate({ to: '/search', search: { q: '', type: 'all' } })}
            />
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
            onOpen={() => {
              if (req.status === 'available') {
                navigate({ to: '/search', search: { q: '', type: 'all' } });
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
      </Box>
    </PageFrame>
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

  // The status rides INSIDE the control: the whole row is the one press target,
  // so a chip parked beside it would leave two thirds of the card dead and ring
  // only the part it did not cover. It joins the label rather than being read
  // separately, which is what a row announcing "Mutiny, approved" wants.
  return (
    <Surface pad="none" p={14} radius="2xl" border="border" row align="center" gap={16}>
      <Focusable
        onPress={onOpen}
        label={`${req.title} · ${t(requestStatusMeta(req.status).labelKey)}`}
        style={s.head}
      >
        <Box w={46} h={68} shrink={0}>
          <Img src={poster} background={`linear-gradient(158deg, ${c1}, ${c2})`} radius="lg" fill />
        </Box>
        <Box minW={0} shrink={1}>
          <Text variant="label" lines={1}>
            {req.title}
          </Text>
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
        </Box>
        <Box flex />
        <RequestStatusChip status={req.status} progress={progress ?? req.progress ?? null} />
      </Focusable>
      {req.status === 'pending' ? (
        <IconButton
          control="sm"
          icon="x"
          label={t('requests.cancel')}
          onPress={onCancel}
          disabled={busy}
        />
      ) : null}
    </Surface>
  );
}

const s = styles({
  head: { row: true, align: 'center', gap: 16, flex: true, minW: 0 },
});
