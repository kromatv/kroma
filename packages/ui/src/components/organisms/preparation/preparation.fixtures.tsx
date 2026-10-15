import type { CapabilitySource } from '@kromatv/client/capabilities';
import { DownloadId } from '@kromatv/client/watchable';
import type { WatchStage } from '@kromatv/core';
import { Box } from '#ui/components/atoms/box';
import { sampleArrival, sampleSource } from '#ui/lib/sample-arrival';
import { stillArt } from '#ui/lib/sample-art';
import { Preparation } from './preparation';

const FILE = {
  index: 5,
  name: 'Sintel.2010.1080p.mkv',
  sizeBytes: 129_241_752,
  isVideo: true,
  season: null,
  episode: null,
};

const TARGET = {
  entry: {
    id: DownloadId.parse('9619ccec50f68056'),
    requestId: null,
    tmdbId: 45745,
    title: 'Sintel',
    year: 2010,
    kind: 'movie' as const,
    posterUrl: null,
    progress: 0.34,
    status: 'downloading' as const,
    ephemeral: false,
    files: [FILE],
  },
  file: FILE,
};

const RELEASE = 'Sintel.2010.1080p.BluRay.x264';

const SEARCHING: WatchStage = { stage: 'searching', release: null, downloadId: null };

export const STAGES: Record<string, WatchStage> = {
  searching: SEARCHING,
  connecting: { stage: 'connecting', release: RELEASE, downloadId: TARGET.entry.id },
  buffering: { stage: 'buffering', release: RELEASE, downloadId: TARGET.entry.id, target: TARGET },
  noSource: { stage: 'failed', failure: 'noSource', message: "Aucune source n'a répondu en 30 s." },
  noIndexer: {
    stage: 'failed',
    failure: 'noIndexer',
    message: "Internet Archive: definition 'internetarchive' not found",
  },
  unsupported: { stage: 'failed', failure: 'unsupported', message: null },
  failed: { stage: 'failed', failure: 'failed', message: null },
};

export const STAGE_NAMES = Object.keys(STAGES);

const USENET: CapabilitySource = {
  mount: '/api/module/tv.kroma.usenet',
  label: 'Usenet',
  icon: 'cloud',
  figures: [
    { key: 'downloaded', label: 'Récupéré', kind: 'percent' },
    { key: 'speed', label: 'Débit', kind: 'rate' },
    { key: 'articles', label: 'Articles', kind: 'count' },
  ],
  actions: [{ key: 'cancel', label: 'Arrêter' }],
};

export const SOURCES = [sampleSource, USENET];

export function Screen({
  stage,
  percent,
  stalled,
  art,
  declared,
}: Readonly<{
  stage: string;
  percent: number;
  stalled?: boolean;
  art?: boolean;
  declared?: boolean;
}>) {
  const standing = STAGES[stage] ?? SEARCHING;
  return (
    <Box flex bg="#000000" overflow="hidden">
      <Preparation
        stage={standing}
        progress={standing.stage === 'buffering' ? sampleArrival(percent, stalled) : null}
        source={declared === false ? null : sampleSource}
        title="Sintel"
        art={art === false ? null : stillArt(2)}
        onBack={() => {}}
        onCancel={() => {}}
      />
    </Box>
  );
}

export function Choice() {
  return (
    <Box flex bg="#000000" overflow="hidden">
      <Preparation
        stage={SEARCHING}
        progress={null}
        source={null}
        sources={SOURCES}
        onSourceChange={() => {}}
        title="Sintel"
        art={stillArt(2)}
        onBack={() => {}}
        onCancel={() => {}}
      />
    </Box>
  );
}
