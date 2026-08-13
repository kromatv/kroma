// What this module puts on the core's request page, through the
// `requests.episode.progress` slot: how far along the download of one episode
// is. A ledger row saying "en téléchargement" with no bar is a row that looks
// stuck, and the queue is the only thing that knows better -- which is exactly
// why the core cannot draw it.

import { type SlotProps, useAdminHost } from '@kroma/module-sdk';
import { Box, Progress, Row, Text } from '@kroma/ui/kit';
import { useQuery } from '@tanstack/react-query';
import type { DownloadsView } from './schemas';

const MODULE_ID = 'tv.kroma.torrents';
const POLL_MS = 4000;

// One query for the whole request, shared by every row through the query key:
// a season of rows must not become a season of requests.
function useRequestDownloads(requestId: string) {
  const { client } = useAdminHost();
  const { data } = useQuery({
    queryKey: ['admin', 'requests', requestId, 'downloads'],
    queryFn: () => client.module(MODULE_ID).get<DownloadsView>('/downloads'),
    refetchInterval: POLL_MS,
    retry: false,
  });
  return data?.downloads ?? [];
}

export function EpisodeProgress({
  requestId,
  season,
  episode,
}: Readonly<SlotProps['requests.episode.progress']>) {
  const downloads = useRequestDownloads(requestId);
  const row = downloads.find(
    (d) =>
      d.requestId === requestId &&
      d.season === season &&
      (d.episodes ?? []).includes(episode) &&
      d.status !== 'imported' &&
      d.status !== 'failed',
  );
  if (!row) return null;
  const progress = Math.min(1, Math.max(0, row.progress));
  return (
    <Row gap={8} align="center" mt={2}>
      <Box flex minW={0}>
        <Progress value={progress} />
      </Box>
      <Text variant="meta" color="info" shrink={0}>
        {`${Math.round(progress * 100)}%`}
      </Text>
    </Row>
  );
}
