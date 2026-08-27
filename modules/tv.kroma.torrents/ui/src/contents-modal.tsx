import { apiErrorText, useFetch, useT } from '@kroma/module-sdk';
import { Box, Callout, Dialog, Icon, Img, Row, Spinner, Text } from '@kroma/ui/kit';
import { createCallable } from 'react-call';
import { useTorrentsApi } from './api';
import type { DownloadView } from './schemas';
import { TorrentContents } from './torrent-contents';
import { useEpisodeNames } from './use-episode-names';

const POSTER_WIDTH = 46;
const POSTER_HEIGHT = 69;

export const ContentsModal = createCallable<{ dl: DownloadView }, void>(({ call, dl }) => {
  const t = useT();
  const torrents = useTorrentsApi();
  const {
    data: contents,
    failed,
    error: cause,
  } = useFetch(['admin', 'torrents', 'contents', dl.id], () => torrents.contents(dl.id));
  const error = failed ? apiErrorText(cause, t('contents.failed')) : null;

  const episodeNames = useEpisodeNames(dl.tmdbId, dl.season);

  return (
    <Dialog.Root open title={t('contents.title')} onClose={() => call.end()} width="md">
      <Row gap={12} align="center">
        <Box
          w={POSTER_WIDTH}
          h={POSTER_HEIGHT}
          shrink={0}
          center
          radius={4}
          overflow="hidden"
          bg="tint/5"
        >
          {dl.posterUrl ? (
            <Img src={dl.posterUrl} fill />
          ) : (
            <Icon name="movie" size={16} color="glyphDim" />
          )}
        </Box>
        <Box flex minW={0} gap={2}>
          <Text variant="label" lines={1}>
            {dl.title}
          </Text>
          {dl.releaseTitle === dl.title ? null : (
            <Text variant="meta" color="text/40" lines={2}>
              {dl.releaseTitle}
            </Text>
          )}
        </Box>
      </Row>

      {error ? (
        <Callout.Root size="sm" tone="danger" icon="alert-triangle">
          <Callout.Title>{error}</Callout.Title>
        </Callout.Root>
      ) : null}

      {!contents && !error ? (
        <Row center gap={8} py={28}>
          <Spinner />
          <Text variant="meta" color="text/45">
            {t('contents.reading')}
          </Text>
        </Row>
      ) : null}

      {contents ? (
        <Box mt={4}>
          <TorrentContents analysis={contents} episodes={episodeNames} />
        </Box>
      ) : null}

      <Dialog.Footer>
        <Dialog.Actions onCancel={() => call.end()} cancelLabel={t('common.close')} />
      </Dialog.Footer>
    </Dialog.Root>
  );
});
