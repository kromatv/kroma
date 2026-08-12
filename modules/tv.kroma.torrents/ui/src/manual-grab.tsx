// Manual grab modal: search indexers or paste a magnet, ANALYZE the torrent's
// real file list (Sonarr/Radarr-style), pick which episodes/files to download,
// and set the target so import lands them in the right library. The detected
// entity pre-fills the form; the admin can override when detection is unsure.
//
// NOTE an inversion: the backend graph has acquisition dependsOn torrents, yet
// this file (torrents) drives acquisition's search/analyze/add. The entangle-
// ment is real (a manual grab needs both halves) and predates this layout; it
// used to hide inside the monolithic client. If it ever needs untangling, the
// manual-grab flow moves INTO acquisition and reaches this page via module
// exports (`getModuleApi`), not by a package import in this direction.

import { formatBytes } from '@kroma/core';
import { useAcquisitionApi } from '@kroma/module-acquisition/api';
import type {
  ManualReleaseView,
  TorrentAnalysis,
  TorrentFileView,
} from '@kroma/module-acquisition/schemas';
import { apiErrorText, useAsyncAction, useT } from '@kroma/module-sdk';
import {
  Box,
  Button,
  color,
  Dialog,
  Field,
  Focusable,
  Icon,
  Row,
  SegmentedControl,
  styles,
  sv,
  Text,
} from '@kroma/ui/kit';
import { type CSSProperties, useState } from 'react';

type Kind = 'movie' | 'episode' | 'season';

const KIND_TONE: Record<string, string> = {
  movie: 'accent',
  episode: 'info',
  season: 'hdr',
  series: 'hdr',
  unknown: 'text/55',
};

const kindInk = (kind: string) => color(KIND_TONE[kind] ?? 'text/55');

const FILE_LIST: CSSProperties = { maxHeight: 208, overflowY: 'auto' };

const RESULT_LIST: CSSProperties = {
  marginTop: 8,
  maxHeight: 176,
  overflowY: 'auto',
  borderRadius: 'var(--radius-xl)',
  border: '1px solid color-mix(in srgb, var(--kroma-tint) 7%, transparent)',
  background: 'var(--kroma-bg)',
};

const FILE_ROW: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '6px 8px',
  borderRadius: 'var(--radius-sm)',
  cursor: 'pointer',
};

const FILE_ROW_LOCKED: CSSProperties = { ...FILE_ROW, cursor: 'default', opacity: 0.45 };

const FILE_BOX: CSSProperties = { width: 14, height: 14, accentColor: 'var(--kroma-accent)' };

const s = styles({
  tabular: { fontVariant: ['tabular-nums'] },
});

const resultRow = sv({
  base: {
    row: true,
    align: 'center',
    w: '100%',
    gap: 12,
    px: 12,
    py: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'tint/4',
    _hover: { bg: 'tint/3' },
  },
  variants: {
    last: { true: { borderBottomWidth: 0 } },
  },
  defaults: { last: false },
});

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

  const doSearch = () => {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setSearchErr(null);
    acquisition
      .search(q)
      .then((v) => {
        setResults(v.releases);
        if (v.indexerErrors.length) setSearchErr(v.indexerErrors.join(' · '));
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
    <Dialog.Root open title={t('manual.title')} onClose={onClose} width={520}>
      {/* search sub-panel */}
      <SearchPanel
        query={query}
        setQuery={setQuery}
        searching={searching}
        searchErr={searchErr}
        results={results}
        onSearch={doSearch}
        onPick={pick}
      />

      {/* magnet + analyze */}
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

      {/* analysis result: detected kind + file selection */}
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

      {/* target form */}
      <Field.Root label={t('manual.kind')}>
        <SegmentedControl.Root
          value={kind}
          onValueChange={setKind}
          label={t('manual.kind')}
          options={[
            { value: 'movie' as const, label: t('manual.kindMovie') },
            { value: 'episode' as const, label: t('manual.kindEpisode') },
            { value: 'season' as const, label: t('manual.kindSeason') },
          ]}
        />
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

function AnalysisPanel({
  analysis,
  videoFiles,
  selected,
  allVideoSelected,
  setSelected,
  onToggleFile,
}: Readonly<{
  analysis: TorrentAnalysis;
  videoFiles: TorrentFileView[];
  selected: Set<number>;
  allVideoSelected: boolean;
  setSelected: (value: Set<number>) => void;
  onToggleFile: (i: number) => void;
}>) {
  const t = useT();
  const seasonTags = analysis.seasons.map((season) => `S${season}`).join(' ');
  const seasonsLabel = analysis.seasons.length > 0 ? ` · ${seasonTags}` : '';
  const ink = kindInk(analysis.kind);
  return (
    <Box radius="xl" border="tint/7" bg="bg" p={12}>
      <Row between mb={8}>
        <Row
          self="flex-start"
          gap={6}
          px={10}
          py={4}
          radius="pill"
          style={{ backgroundColor: `color-mix(in srgb, ${ink} 12%, transparent)` }}
        >
          <Text variant="overline" color={ink}>
            {t(`manual.detected.${analysis.kind}` as Parameters<typeof t>[0])}
            {seasonsLabel}
          </Text>
        </Row>
        {videoFiles.length > 1 ? (
          <Button
            variant="ghost"
            size="sm"
            label={allVideoSelected ? t('manual.selectNone') : t('manual.selectAll')}
            onPress={() =>
              setSelected(allVideoSelected ? new Set() : new Set(videoFiles.map((f) => f.index)))
            }
          />
        ) : null}
      </Row>
      <div style={FILE_LIST}>
        {analysis.files.map((f) => (
          <FileRow
            key={f.index}
            f={f}
            checked={selected.has(f.index)}
            onToggle={() => onToggleFile(f.index)}
          />
        ))}
      </div>
      {videoFiles.length > 1 ? (
        <Text variant="meta" color="textDim" mt={8}>
          {t('manual.selectedCount', {
            n: String(selected.size),
            total: String(videoFiles.length),
          })}
        </Text>
      ) : null}
    </Box>
  );
}

function FileRow({
  f,
  checked,
  onToggle,
}: Readonly<{ f: TorrentFileView; checked: boolean; onToggle: () => void }>) {
  const label =
    f.episode != null
      ? `S${String(f.season ?? 0).padStart(2, '0')}E${String(f.episode).padStart(2, '0')}`
      : null;
  return (
    <label style={f.isVideo ? FILE_ROW : FILE_ROW_LOCKED} title={f.path}>
      <input
        type="checkbox"
        checked={checked}
        disabled={!f.isVideo}
        onChange={onToggle}
        style={FILE_BOX}
      />
      <Text variant="meta" color="text/75" flex minW={0} lines={1}>
        {f.path.split('/').pop()}
      </Text>
      {label ? (
        <Text variant="meta" color="info" shrink={0}>
          {label}
        </Text>
      ) : null}
      <Text variant="meta" color="textDim" shrink={0} style={s.tabular}>
        {formatBytes(f.sizeBytes)}
      </Text>
    </label>
  );
}

function SearchPanel({
  query,
  setQuery,
  searching,
  searchErr,
  results,
  onSearch,
  onPick,
}: Readonly<{
  query: string;
  setQuery: (v: string) => void;
  searching: boolean;
  searchErr: string | null;
  results: ManualReleaseView[] | null;
  onSearch: () => void;
  onPick: (r: ManualReleaseView) => void;
}>) {
  const t = useT();
  return (
    <Box>
      <Box row gap={8}>
        <Field.Root
          label={t('manual.search')}
          hideLabel
          flex
          value={query}
          onValueChange={setQuery}
        >
          <Field.Input
            icon="search"
            onSubmit={onSearch}
            placeholder={t('manual.searchPlaceholder')}
          />
        </Field.Root>
        <Button
          variant="primary"
          size="sm"
          label={t('manual.search')}
          onPress={onSearch}
          disabled={!query.trim()}
          loading={searching}
        />
      </Box>
      {searchErr ? (
        <Text variant="meta" color="accentText" mt={6}>
          {searchErr}
        </Text>
      ) : null}
      {results ? (
        <div style={RESULT_LIST}>
          {results.length === 0 ? (
            <Box px={12} py={16}>
              <Text variant="meta" color="textDim" textAlign="center">
                {t('manual.noResults')}
              </Text>
            </Box>
          ) : (
            results.map((r, index) => (
              <ResultRow
                key={`${r.indexerName}-${r.guid}`}
                r={r}
                last={index === results.length - 1}
                onPick={() => onPick(r)}
              />
            ))
          )}
        </div>
      ) : null}
    </Box>
  );
}

function ResultRow({
  r,
  last,
  onPick,
}: Readonly<{ r: ManualReleaseView; last: boolean; onPick: () => void }>) {
  const t = useT();
  return (
    <Focusable sv={resultRow} vars={{ last }} label={r.title} onPress={onPick}>
      <Box minW={0} flex>
        <Text variant="meta" lines={1}>
          {r.title}
        </Text>
        <Row wrap gapX={10} mt={2}>
          <Text variant="meta" color="textDim">
            {r.indexerName}
          </Text>
          {r.resolution ? (
            <Text variant="meta" color="info">
              {r.resolution}
            </Text>
          ) : null}
          {r.codec ? (
            <Text variant="meta" color="hdr">
              {r.codec}
            </Text>
          ) : null}
          {r.sizeBytes != null ? (
            <Text variant="meta" color="textDim">
              {formatBytes(r.sizeBytes)}
            </Text>
          ) : null}
          {r.seeders != null ? (
            <Text variant="meta" color="success">
              {t('requests.seedersN', { n: String(r.seeders) })}
            </Text>
          ) : null}
          {r.detailsUrl ? (
            <Text variant="meta" color="text/30">
              · {t('downloads.hasTrackerPage')}
            </Text>
          ) : null}
        </Row>
      </Box>
      <Box shrink={0}>
        <Icon name="download" size={15} thickness={2.2} color="accent" />
      </Box>
    </Focusable>
  );
}
