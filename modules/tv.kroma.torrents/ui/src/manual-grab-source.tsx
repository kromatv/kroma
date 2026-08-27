// Step one of a manual add: where the torrent comes from.

import type { ManualReleaseView } from '@kroma/module-acquisition/schemas';
import { apiErrorText, useAsyncAction, useT } from '@kroma/module-sdk';
import type { DropzoneRejection } from '@kroma/ui/kit';
import { Box, Button, Callout, Dropzone, Field, SegmentGroup } from '@kroma/ui/kit';
import { useState } from 'react';
import { useTorrentsApi } from './api';
import { SearchPanel } from './manual-grab-search';

// The server refuses anything larger before it parses it; saying so here saves
// the round trip.
const MAX_TORRENT_BYTES = 1024 * 1024;

const BARE_SOURCE = {
  magnet: '',
  releaseTitle: '',
  detailsUrl: null,
  kind: 'movie',
  title: '',
  year: null,
  season: null,
  episodes: null,
} satisfies TorrentSource;

function kindOf(season: number | null, episode: number | null): string {
  if (season === null) return 'movie';
  return episode === null ? 'season' : 'episode';
}

type Door = 'search' | 'magnet' | 'file';

/** What every door hands back. The parsed facts matter as much as the link: the
 *  title step searches the metadata provider with them, and a raw release name
 *  ("Stargate Atlantis iNTEGRALE MULTi") matches nothing. Every door fills them
 *  from the SAME parser the acquisition stack scores releases with. */
export interface TorrentSource {
  magnet: string;
  releaseTitle: string;
  detailsUrl: string | null;
  /** `movie` | `season` | `episode`, read off the release name. */
  kind: string;
  title: string;
  year: number | null;
  season: number | null;
  episodes: number[] | null;
}

interface SourceStepProps {
  search: {
    query: string;
    setQuery: (next: string) => void;
    searching: boolean;
    searchErr: string | null;
    results: ManualReleaseView[] | null;
    onSearch: () => void;
  };
  onPicked: (source: TorrentSource) => void;
}

export function SourceStep({ search, onPicked }: Readonly<SourceStepProps>) {
  const t = useT();
  const torrents = useTorrentsApi();
  const { busy, error, run } = useAsyncAction();
  const [door, setDoor] = useState<Door>('search');
  const [magnet, setMagnet] = useState('');
  const [refused, setRefused] = useState<DropzoneRejection | null>(null);

  const takeFile = (file: File | undefined) => {
    if (!file) return;
    setRefused(null);
    run(
      async () => {
        const inspected = await torrents.inspectTorrent(file);
        onPicked({
          magnet: inspected.magnet,
          releaseTitle: inspected.releaseTitle,
          detailsUrl: null,
          kind: inspected.kind,
          title: inspected.title ?? '',
          year: inspected.year,
          season: inspected.season,
          episodes: inspected.episodes,
        });
      },
      (e) => apiErrorText(e, t('manual.fileFailed')),
    );
  };

  return (
    <Box gap={14}>
      <SegmentGroup.Root
        value={door}
        onValueChange={setDoor}
        label={t('manual.sourceLabel')}
        stretch
      >
        <SegmentGroup.Item value="search" icon="search">
          <SegmentGroup.Label>{t('manual.sourceSearch')}</SegmentGroup.Label>
        </SegmentGroup.Item>
        <SegmentGroup.Item value="magnet" icon="magnet">
          <SegmentGroup.Label>{t('manual.sourceMagnet')}</SegmentGroup.Label>
        </SegmentGroup.Item>
        <SegmentGroup.Item value="file" icon="file-upload">
          <SegmentGroup.Label>{t('manual.sourceFile')}</SegmentGroup.Label>
        </SegmentGroup.Item>
      </SegmentGroup.Root>

      {door === 'search' ? (
        <SearchPanel
          query={search.query}
          setQuery={search.setQuery}
          searching={search.searching}
          searchErr={search.searchErr}
          results={search.results}
          onSearch={search.onSearch}
          onPick={(release: ManualReleaseView) =>
            onPicked({
              magnet: release.downloadUrl ?? '',
              releaseTitle: release.title,
              detailsUrl: release.detailsUrl ?? null,
              kind: kindOf(release.season, release.episode),
              title: release.parsedTitle,
              year: release.year,
              season: release.season,
              episodes: release.episode === null ? null : [release.episode],
            })
          }
        />
      ) : null}

      {door === 'magnet' ? (
        <Box gap={10}>
          <Field.Root label={t('manual.magnet')} value={magnet} onValueChange={setMagnet}>
            <Field.Input placeholder="magnet:?xt=urn:btih:..." />
            <Field.Hint>{t('manual.magnetHint')}</Field.Hint>
          </Field.Root>
          <Button
            variant="primary"
            icon="arrow-right"
            label={t('manual.next')}
            disabled={!magnet.trim()}
            onPress={() => onPicked({ ...BARE_SOURCE, magnet: magnet.trim() })}
          />
        </Box>
      ) : null}

      {door === 'file' ? (
        <Dropzone.Root
          label={t('manual.chooseFile')}
          accept=".torrent,application/x-bittorrent"
          maxSize={MAX_TORRENT_BYTES}
          loading={busy}
          onDrop={([file]) => takeFile(file)}
          onReject={([turned]) => setRefused(turned ?? null)}
        >
          <Dropzone.Icon />
          <Dropzone.Title>{t('manual.chooseFile')}</Dropzone.Title>
          <Dropzone.Description>{t('manual.fileHint')}</Dropzone.Description>
        </Dropzone.Root>
      ) : null}

      {refused ? (
        <Callout.Root size="sm" tone="danger" icon="alert-triangle">
          <Callout.Title>
            {t(refused.reason === 'size' ? 'manual.fileTooBig' : 'manual.fileWrongKind', {
              name: refused.file.name,
            })}
          </Callout.Title>
        </Callout.Root>
      ) : null}

      {error ? (
        <Callout.Root size="sm" tone="danger" icon="alert-triangle">
          <Callout.Title>{error}</Callout.Title>
        </Callout.Root>
      ) : null}
    </Box>
  );
}
