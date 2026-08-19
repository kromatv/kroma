// Manual grab modal: say what you are after, search indexers or paste a magnet,
// ANALYZE the torrent's real file list (Sonarr/Radarr-style), pick which
// episodes/files to download, and add it. The target block leads because it
// scopes the search too: a season/episode there makes the sweep a TV search
// instead of a movie one, which is the only way to find a specific episode.
//
// NOTE an inversion: the backend graph has acquisition dependencies torrents, yet
// this file (torrents) drives acquisition's search/analyze/add. The entangle-
// ment is real (a manual grab needs both halves) and predates this layout; it
// used to hide inside the monolithic client. If it ever needs untangling, the
// manual-grab flow moves INTO acquisition and reaches this page via module
// exports (`getModuleApi`), not by a package import in this direction.

import { useAcquisitionApi } from '@kroma/module-acquisition/api';
import type {
  ManualReleaseView,
  TorrentAnalysis,
  TorrentFileView,
} from '@kroma/module-acquisition/schemas';
import { apiErrorText, useAsyncAction, useT } from '@kroma/module-sdk';
import { Box, Button, Dialog, Field, SegmentGroup, Text } from '@kroma/ui/kit';
import { useState } from 'react';
import { AnalysisPanel } from './manual-grab-analysis';
import { SearchPanel } from './manual-grab-search';

type Kind = 'movie' | 'episode' | 'season';

/** Derive the pre-filled target from the detected content. Absent `season` /
 * `episode` keys mean "leave the current value untouched". */
function detectTarget(a: TorrentAnalysis): { kind: Kind; season?: string; episode?: string } {
  if (a.kind === 'movie') return { kind: 'movie' };
  if (a.kind === 'episode') {
    const ep = a.files.find((f) => f.episode != null);
    if (ep) {
      return {
        kind: 'episode',
        season: ep.season != null ? String(ep.season) : '',
        episode: String(ep.episode),
      };
    }
    return { kind: 'episode' };
  }
  // season / series: import per-file by parsed S/E.
  const first = a.files.find((f) => f.season != null);
  if (first?.season != null && a.seasons.length === 1) {
    return { kind: 'season', season: String(first.season) };
  }
  return { kind: 'season' };
}

/** Assemble the `manualAdd` payload from the current form + analysis state. */
function buildManualAddBody(fields: {
  magnet: string;
  kind: Kind;
  title: string;
  year: string;
  season: string;
  episode: string;
  detailsUrl: string | null;
  analysis: TorrentAnalysis | null;
  selected: Set<number>;
  videoFiles: TorrentFileView[];
}) {
  const { magnet, kind, title, year, season, episode, detailsUrl, analysis, selected, videoFiles } =
    fields;
  // Only send onlyFiles when the admin narrowed the selection.
  const totalVideos = videoFiles.length;
  const onlyFiles =
    analysis && selected.size > 0 && selected.size < totalVideos
      ? [...selected].sort((a, b) => a - b)
      : null;
  return {
    magnetOrUrl: magnet.trim(),
    kind,
    title: title.trim() || null,
    year: year ? Number.parseInt(year, 10) : null,
    season: kind !== 'movie' && season ? Number.parseInt(season, 10) : null,
    episode: kind === 'episode' && episode ? Number.parseInt(episode, 10) : null,
    tmdbId: null,
    onlyFiles,
    detailsUrl,
  };
}

const pad = (v: string) => v.padStart(2, '0');

// What the sweep is narrowed to, for the hint under the search field. Null when
// nothing narrows it (a movie search, or a show with no season typed yet).
function scopeLabel(kind: Kind, season: string, episode: string): string | null {
  if (kind === 'movie' || !season) return null;
  return kind === 'episode' && episode ? `S${pad(season)}E${pad(episode)}` : `S${pad(season)}`;
}

export function ManualGrabModal({
  onClose,
  onAdded,
}: Readonly<{ onClose: () => void; onAdded: () => void }>) {
  const t = useT();
  const acquisition = useAcquisitionApi();
  const { busy, error, run } = useAsyncAction();

  // Search sub-panel
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<ManualReleaseView[] | null>(null);
  const [searchErr, setSearchErr] = useState<string | null>(null);

  // Analysis
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<TorrentAnalysis | null>(null);
  const [analyzeErr, setAnalyzeErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // Target form
  const [magnet, setMagnet] = useState('');
  const [detailsUrl, setDetailsUrl] = useState<string | null>(null);
  const [kind, setKind] = useState<Kind>('movie');
  const [title, setTitle] = useState('');
  const [year, setYear] = useState('');
  const [season, setSeason] = useState('');
  const [episode, setEpisode] = useState('');

  const resetAnalysis = () => {
    setAnalysis(null);
    setAnalyzeErr(null);
    setSelected(new Set());
  };

  // The target block's season/episode double as the search's, so "find me
  // S03E07" is one form rather than two.
  const doSearch = () => {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setSearchErr(null);
    acquisition
      .search({
        query: q,
        kind,
        season: kind !== 'movie' && season ? Number.parseInt(season, 10) : null,
        episode: kind === 'episode' && episode ? Number.parseInt(episode, 10) : null,
      })
      .then((v) => {
        setResults(v.releases);
        const failed = v.indexers.filter((i) => i.error);
        if (failed.length) setSearchErr(failed.map((i) => `${i.name}: ${i.error}`).join(' · '));
      })
      .catch((e) => setSearchErr(apiErrorText(e, t('manual.searchFailed'))))
      .finally(() => setSearching(false));
  };

  const pick = (r: ManualReleaseView) => {
    setMagnet(r.downloadUrl ?? '');
    setDetailsUrl(r.detailsUrl ?? null);
    setTitle(r.parsedTitle || title);
    setYear(r.year ? String(r.year) : '');
    resetAnalysis();
  };

  const analyze = () => {
    const m = magnet.trim();
    if (!m) return;
    setAnalyzing(true);
    setAnalyzeErr(null);
    acquisition
      .analyze(m)
      .then((a) => {
        setAnalysis(a);
        // Default selection = all video files.
        setSelected(new Set(a.files.filter((f) => f.isVideo).map((f) => f.index)));
        // Pre-fill the target from the detected content (admin can still override).
        const det = detectTarget(a);
        setKind(det.kind);
        if (det.season !== undefined) setSeason(det.season);
        if (det.episode !== undefined) setEpisode(det.episode);
      })
      .catch((e) => setAnalyzeErr(apiErrorText(e, t('manual.analyzeFailed'))))
      .finally(() => setAnalyzing(false));
  };

  const toggleFile = (i: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const videoFiles = analysis?.files.filter((f) => f.isVideo) ?? [];
  const allVideoSelected = videoFiles.length > 0 && videoFiles.every((f) => selected.has(f.index));

  const add = () =>
    run(
      async () => {
        await acquisition.add(
          buildManualAddBody({
            magnet,
            kind,
            title,
            year,
            season,
            episode,
            detailsUrl,
            analysis,
            selected,
            videoFiles,
          }),
        );
        onAdded();
        onClose();
      },
      (e) => apiErrorText(e, t('manual.addFailed')),
    );

  const canAdd = magnet.trim().length > 0 && title.trim().length > 0;

  return (
    <Dialog.Root open title={t('manual.title')} onClose={onClose} width="lg">
      <Field.Root label={t('manual.kind')}>
        <SegmentGroup.Root value={kind} onValueChange={setKind} label={t('manual.kind')}>
          <SegmentGroup.Item value="movie">
            <SegmentGroup.Label>{t('manual.kindMovie')}</SegmentGroup.Label>
          </SegmentGroup.Item>
          <SegmentGroup.Item value="episode">
            <SegmentGroup.Label>{t('manual.kindEpisode')}</SegmentGroup.Label>
          </SegmentGroup.Item>
          <SegmentGroup.Item value="season">
            <SegmentGroup.Label>{t('manual.kindSeason')}</SegmentGroup.Label>
          </SegmentGroup.Item>
        </SegmentGroup.Root>
      </Field.Root>
      <Box row={{ base: false, md: true }} gap={16}>
        <Field.Root
          label={t('manual.titleLabel')}
          value={title}
          onValueChange={setTitle}
          flex={{ base: 0, md: 1 }}
        >
          <Field.Input placeholder="The Matrix" />
          <Field.Hint>{t('manual.titleHint')}</Field.Hint>
        </Field.Root>
        <Field.Root
          label={t('manual.year')}
          value={year}
          onValueChange={setYear}
          w={{ base: '100%', md: 100 }}
        >
          <Field.Input placeholder="1999" />
        </Field.Root>
      </Box>
      {kind !== 'movie' ? (
        <Box row={{ base: false, md: true }} gap={16}>
          <Field.Root
            label={t('manual.season')}
            value={season}
            onValueChange={setSeason}
            flex={{ base: 0, md: 1 }}
          >
            <Field.Input placeholder="1" />
          </Field.Root>
          {kind === 'episode' ? (
            <Field.Root
              label={t('manual.episode')}
              value={episode}
              onValueChange={setEpisode}
              flex={{ base: 0, md: 1 }}
            >
              <Field.Input placeholder="1" />
            </Field.Root>
          ) : null}
        </Box>
      ) : null}

      <SearchPanel
        query={query}
        scopeLabel={scopeLabel(kind, season, episode)}
        setQuery={setQuery}
        searching={searching}
        searchErr={searchErr}
        results={results}
        onSearch={doSearch}
        onPick={pick}
      />

      <Field.Root
        label={t('manual.magnet')}
        value={magnet}
        onValueChange={(v) => {
          setMagnet(v);
          setDetailsUrl(null);
          resetAnalysis();
        }}
      >
        <Field.Input
          placeholder="magnet:?xt=urn:btih:..."
          trailing={
            <Button
              variant="glass"
              size="sm"
              icon="wand"
              label={t('manual.analyze')}
              onPress={analyze}
              disabled={!magnet.trim()}
              loading={analyzing}
            />
          }
        />
        <Field.Hint>{t('manual.magnetHint')}</Field.Hint>
      </Field.Root>
      {analyzeErr ? (
        <Text variant="meta" color="dangerHover">
          {analyzeErr}
        </Text>
      ) : null}

      {analysis ? (
        <AnalysisPanel
          analysis={analysis}
          videoFiles={videoFiles}
          selected={selected}
          allVideoSelected={allVideoSelected}
          setSelected={setSelected}
          onToggleFile={toggleFile}
        />
      ) : null}

      {error ? (
        <Text variant="meta" color="dangerHover">
          {error}
        </Text>
      ) : null}
      <Dialog.Actions
        onCancel={onClose}
        cancelLabel={t('common.cancel')}
        onConfirm={add}
        confirmLabel={busy ? t('manual.adding') : t('manual.add')}
        busy={busy}
        disabled={!canAdd}
      />
    </Dialog.Root>
  );
}
