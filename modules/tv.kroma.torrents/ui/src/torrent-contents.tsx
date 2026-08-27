import type { TorrentAnalysis, TorrentFileView } from '@kroma/module-acquisition/schemas';
import { useFormat, useT } from '@kroma/module-sdk';
import type { IconName } from '@kroma/ui/kit';
import { Badge, Box, Checkbox, Icon, Img, Row, styles, Text } from '@kroma/ui/kit';
import { useMemo } from 'react';
import {
  bytesOf,
  type ContentsGroup,
  type ContentsGroupKind,
  type ContentsSelection,
  contentsLayout,
  groupContents,
  withFilesSelected,
} from './contents-files';
import type { EpisodeInfo } from './schemas';

const STILL_WIDTH = 64;
const STILL_HEIGHT = 36;

const s = styles({
  tabular: { fontVariant: ['tabular-nums'] },
});

const GROUP_ICON: Record<ContentsGroupKind, IconName> = {
  season: 'stack',
  film: 'movie',
  extras: 'file-text',
};

const fileName = (path: string) => path.split('/').pop() ?? path;

interface TorrentContentsProps {
  analysis: TorrentAnalysis;
  selection?: ContentsSelection;
  episodes?: Map<number, EpisodeInfo>;
}

export function TorrentContents({ analysis, selection, episodes }: Readonly<TorrentContentsProps>) {
  const groups = useMemo(() => groupContents(analysis.files), [analysis.files]);
  const { showHeadings, showTotal } = contentsLayout(groups);
  const showStills = (episodes?.size ?? 0) > 0;

  return (
    <Box gap={10}>
      {showTotal ? <TotalRow analysis={analysis} selection={selection} /> : null}
      <Box gap={12} maxH={360} overflow="scroll">
        {groups.map((group) => (
          <GroupBlock
            key={group.key}
            group={group}
            selection={selection}
            episodes={episodes}
            showHeading={showHeadings}
            showStills={showStills}
          />
        ))}
      </Box>
    </Box>
  );
}

function TotalRow({
  analysis,
  selection,
}: Readonly<{ analysis: TorrentAnalysis; selection?: ContentsSelection }>) {
  const t = useT();
  const fmt = useFormat();
  const videos = analysis.files.filter((file) => file.isVideo);
  const picked = videos.filter((file) => selection?.selected.has(file.index));

  return (
    <Row between gap={12} align="center" px={6}>
      <Row gap={8} align="center" minW={0}>
        {selection ? (
          <GroupCheckbox
            selection={selection}
            files={videos}
            picked={picked.length}
            label={t('contents.selectAll')}
          />
        ) : null}
        <Text variant="meta" color="text/50">
          {selection
            ? t('contents.selected', { count: picked.length, total: videos.length })
            : t('contents.videos', { count: videos.length })}
        </Text>
      </Row>
      <Text variant="meta" color="text/35" shrink={0} style={s.tabular}>
        {fmt.bytes(bytesOf(selection ? picked : analysis.files))}
      </Text>
    </Row>
  );
}

function GroupCheckbox({
  selection,
  files,
  picked,
  label,
}: Readonly<{
  selection: ContentsSelection;
  files: readonly TorrentFileView[];
  picked: number;
  label: string;
}>) {
  return (
    <Checkbox
      checked={picked === files.length}
      indeterminate={picked > 0 && picked < files.length}
      onCheckedChange={(next) =>
        selection.onSelectedChange(withFilesSelected(selection.selected, files, { include: next }))
      }
      label={label}
    />
  );
}

function GroupBlock({
  group,
  selection,
  episodes,
  showHeading,
  showStills,
}: Readonly<{
  group: ContentsGroup;
  selection?: ContentsSelection;
  episodes?: Map<number, EpisodeInfo>;
  showHeading: boolean;
  showStills: boolean;
}>) {
  const t = useT();
  const fmt = useFormat();
  const selectable = selection && group.kind !== 'extras' ? selection : undefined;
  const picked = group.files.filter((file) => selectable?.selected.has(file.index));
  const heading = headingOf(group, t);

  return (
    <Box gap={4}>
      {showHeading ? (
        <Row between gap={10} align="center" px={6}>
          <Row gap={8} align="center" minW={0}>
            {selectable ? (
              <GroupCheckbox
                selection={selectable}
                files={group.files}
                picked={picked.length}
                label={heading}
              />
            ) : null}
            <Icon name={GROUP_ICON[group.kind]} size={12} thickness={2} color="glyphDim" />
            <Text variant="overline" color="textDim" lines={1}>
              {heading}
            </Text>
          </Row>
          {group.files.length > 1 ? (
            <Text variant="meta" color="text/30" shrink={0} style={s.tabular}>
              {fmt.bytes(bytesOf(selectable ? picked : group.files))}
            </Text>
          ) : null}
        </Row>
      ) : null}
      <Box>
        {group.files.map((file) => (
          <FileRow
            key={file.index}
            file={file}
            episode={file.episode === null ? undefined : episodes?.get(file.episode)}
            showStill={showStills && file.episode !== null}
            selection={selectable}
          />
        ))}
      </Box>
    </Box>
  );
}

function headingOf(group: ContentsGroup, t: ReturnType<typeof useT>): string {
  if (group.kind === 'extras') return t('contents.extras', { count: group.files.length });
  if (group.kind === 'film') return t('contents.film');
  return t('contents.season', { season: group.season ?? 0, count: group.files.length });
}

function FileRow({
  file,
  episode,
  showStill,
  selection,
}: Readonly<{
  file: TorrentFileView;
  episode?: EpisodeInfo;
  showStill: boolean;
  selection?: ContentsSelection;
}>) {
  const fmt = useFormat();
  const tag = file.episode === null ? null : `E${String(file.episode).padStart(2, '0')}`;
  const named = episode?.name ?? null;
  const title = named ?? fileName(file.path);

  return (
    <Row gap={10} align="center" py={4} px={6} radius="sm" minW={0}>
      {selection ? (
        <Checkbox
          checked={selection.selected.has(file.index)}
          onCheckedChange={(next) =>
            selection.onSelectedChange(
              withFilesSelected(selection.selected, [file], { include: next }),
            )
          }
          label={title}
        />
      ) : null}
      {showStill ? (
        <Box
          w={STILL_WIDTH}
          h={STILL_HEIGHT}
          shrink={0}
          center
          radius={4}
          overflow="hidden"
          bg="tint/5"
        >
          {episode?.stillUrl ? (
            <Img src={episode.stillUrl} fill />
          ) : (
            <Icon name="movie" size={14} color="glyphDim" />
          )}
        </Box>
      ) : null}
      {tag ? <Badge tone="info">{tag}</Badge> : null}
      <Box flex minW={0}>
        <Text
          variant={named ? 'label' : 'meta'}
          color={file.isVideo ? 'text' : 'text/35'}
          lines={1}
          accessibilityLabel={file.path}
        >
          {title}
        </Text>
        {named ? (
          <Text variant="meta" color="text/25" lines={1}>
            {fileName(file.path)}
          </Text>
        ) : null}
      </Box>
      <Box shrink={0} align="flex-end">
        <Text variant="meta" color="text/35" style={s.tabular}>
          {fmt.bytes(file.sizeBytes)}
        </Text>
        {episode?.airDate ? (
          <Text variant="meta" color="text/20" style={s.tabular}>
            {fmt.elapsed(episode.airDate)}
          </Text>
        ) : null}
      </Box>
    </Row>
  );
}
