// "Media details" modal (admin): the technical truth about the file(s) backing
// one catalog item path, container, size, duration, and every video / audio /
// subtitle stream ffprobe found. All of this already rides on the item DTO the
// fiche loaded, so the modal reads from cache and adds no request.

import type { MediaFile, MediaItem } from '@kroma/core';
import { useT } from '@kroma/ui';
import { Box, Dialog, IconButton, Row, Spinner, Text } from '@kroma/ui/kit';
import { useQuery } from '@tanstack/react-query';
import { createCallable } from 'react-call';
import { catalogQueries } from '#web/shared/lib/queries';
import { FileCard } from '#web/shared/ui/media-info-card';

// Open with `await MediaInfoModal.call({ id, title })`; read-only, so it resolves
// (`void`) purely on dismiss. Its root is mounted once by `CatalogModalHosts`.
export const MediaInfoModal = createCallable<{ id: string; title: string }, void>(
  ({ call, id, title }) => {
    const t = useT();
    // Cached: the fiche already loaded this item, so this resolves instantly.
    const { data: item, isPending } = useQuery(catalogQueries.item(id));
    const files = item ? filesOf(item) : [];

    return (
      <Dialog.Root open title={title} width="lg" onClose={() => call.end()}>
        <Dialog.Header>
          <Row between align="flex-start" gap={16}>
            <Box minW={0}>
              <Text variant="overline" color="white/40">
                {t('mediaInfo.title')}
              </Text>
              <Text variant="title" mt={4} lines={1}>
                {title}
              </Text>
            </Box>
            <IconButton
              control="sm"
              icon="x"
              label={t('common.close')}
              onPress={() => call.end()}
            />
          </Row>
        </Dialog.Header>

        <Dialog.Panel>
          {isPending ? (
            <Box align="center" py={64}>
              <Spinner size={26} color="white/40" />
            </Box>
          ) : null}
          {!isPending && files.length === 0 ? (
            <Text variant="meta" color="white/40" textAlign="center" py={64}>
              {t('mediaInfo.noFile')}
            </Text>
          ) : null}
          {files.map((f, i) => (
            <FileCard key={f.id} file={f} index={i} multi={files.length > 1} />
          ))}
        </Dialog.Panel>
      </Dialog.Root>
    );
  },
);

// A synthetic single-file result from the top-level fields, for legacy rows
// that predate the per-file list.
function filesOf(item: MediaItem): MediaFile[] {
  if (item.files.length) return item.files;
  return [
    {
      id: item.id,
      relPath: item.relPath ?? null,
      container: item.container,
      durationMs: item.durationMs ?? null,
      video: item.video ?? null,
      audio: item.audio ?? null,
      audioTracks: item.audioTracks ?? [],
      subtitles: item.subtitles ?? [],
      size: null,
      edition: null,
      probed: item.video != null,
    },
  ];
}
