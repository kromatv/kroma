// Step one of a manual add: where the release comes from.

import type { ManualReleaseView } from '@kromatv/module-acquisition/schemas';
import { apiErrorText, useAsyncAction, useT } from '@kromatv/module-sdk';
import type { DropzoneRejection } from '@kromatv/ui/kit';
import { Box, Button, Callout, Dropzone, Field, SegmentGroup } from '@kromatv/ui/kit';
import { useState } from 'react';
import { useTorrentsApi } from './api.hook';
import { SearchPanel } from './manual-grab-search';
import { protocolLabel, TORRENT } from './protocol';

// The server refuses anything larger before it parses it; saying so here saves
// the round trip.
const MAX_TORRENT_BYTES = 1024 * 1024;

const BARE_SOURCE = {
  magnet: '',
  protocol: TORRENT,
  releaseTitle: '',
  detailsUrl: null,
  kind: 'movie',
  title: '',
  year: null,
  season: null,
  episodes: null,
} satisfies ReleaseSource;

function kindOf(season: number | null, episode: number | null): string {
  if (season === null) {
    return 'movie';
  }
  return episode === null ? 'season' : 'episode';
}

type Door = 'search' | 'magnet' | 'file';

/** What every door hands back. The parsed facts matter as much as the link: the
 *  title step searches the metadata provider with them, and a raw release name
 *  ("Stargate Atlantis iNTEGRALE MULTi") matches nothing. Every door fills them
 *  from the SAME parser the acquisition stack scores releases with. */
export interface ReleaseSource {
  magnet: string;
  protocol: string;
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
  protocols: readonly string[];
  onPicked: (source: ReleaseSource) => void;
}

export function SourceStep({ search, protocols, onPicked }: Readonly<SourceStepProps>) {
  const t = useT();
  const torrents = useTorrentsApi();
  const { busy, error, run } = useAsyncAction();
  const [door, setDoor] = useState<Door>('search');
  const [refused, setRefused] = useState<DropzoneRejection | null>(null);

  const takeFile = (file: File | undefined) => {
    if (!file) {
      return;
    }
    setRefused(null);
    void run(
      async () => {
        const inspected = await torrents.inspectTorrent(file);
        onPicked({
          magnet: inspected.magnet,
          protocol: TORRENT,
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
              protocol: release.protocol,
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

      {door === 'magnet' ? <LinkDoor protocols={protocols} onPicked={onPicked} /> : null}

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

function LinkDoor({
  protocols,
  onPicked,
}: Readonly<{ protocols: readonly string[]; onPicked: (source: ReleaseSource) => void }>) {
  const t = useT();
  const [link, setLink] = useState('');
  const [picked, setPicked] = useState(TORRENT);
  const protocol = protocols.includes(picked) ? picked : (protocols[0] ?? TORRENT);
  return (
    <Box gap={10}>
      {protocols.length > 1 ? (
        <SegmentGroup.Root
          value={protocol}
          onValueChange={setPicked}
          label={t('manual.protocol')}
          size="sm"
        >
          {protocols.map((one) => (
            <SegmentGroup.Item key={one} value={one}>
              <SegmentGroup.Label>{protocolLabel(t, one)}</SegmentGroup.Label>
            </SegmentGroup.Item>
          ))}
        </SegmentGroup.Root>
      ) : null}
      <LinkField protocol={protocol} value={link} onValueChange={setLink} />
      <Button
        variant="primary"
        icon="arrow-right"
        label={t('manual.next')}
        disabled={!link.trim()}
        onPress={() => onPicked({ ...BARE_SOURCE, magnet: link.trim(), protocol })}
      />
    </Box>
  );
}

function LinkField({
  protocol,
  value,
  onValueChange,
}: Readonly<{ protocol: string; value: string; onValueChange: (next: string) => void }>) {
  const t = useT();
  const torrent = protocol === TORRENT;
  return (
    <Field.Root
      label={torrent ? t('manual.magnet') : t('manual.link')}
      value={value}
      onValueChange={onValueChange}
    >
      <Field.Input placeholder={torrent ? 'magnet:?xt=urn:btih:...' : 'https://...'} />
      <Field.Hint>{torrent ? t('manual.magnetHint') : t('manual.linkHint')}</Field.Hint>
    </Field.Root>
  );
}
