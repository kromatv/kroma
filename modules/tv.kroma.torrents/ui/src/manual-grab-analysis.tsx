// The manual grab's analysis sub-panel: what the torrent actually holds
// (Sonarr/Radarr-style), with the video files the admin can narrow the download
// to. Reading the real file list is the only way to be sure a "season pack" is
// one, so the detected kind shown here is what pre-fills the target block.

import { formatBytes } from '@kroma/core';
import type { TorrentAnalysis, TorrentFileView } from '@kroma/module-acquisition/schemas';
import { useT } from '@kroma/module-sdk';
import { Box, Button, color, Row, styles, Text } from '@kroma/ui/kit';
import type { CSSProperties } from 'react';

const KIND_TONE: Record<string, string> = {
  movie: 'accent',
  episode: 'info',
  season: 'hdr',
  series: 'hdr',
  unknown: 'text/55',
};

const kindInk = (kind: string) => color(KIND_TONE[kind] ?? 'text/55');

const FILE_LIST: CSSProperties = { maxHeight: 208, overflowY: 'auto' };

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

export function AnalysisPanel({
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
