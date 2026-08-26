// One physical file's technical card, as rendered inside the "Media details"
// modal: name / path header, container-size-duration fields, then the video,
// audio and subtitle streams ffprobe found. Split out of `media-info-modal.tsx`
// so each file stays small and every branch reads as its own named piece.

import {
  type AudioTrack,
  channelLabel,
  codecLabel,
  langName,
  type MediaFile,
  type SubtitleTrack,
  type VideoTrack,
} from '@kroma/core';
import { useFormat, useT } from '@kroma/ui';
import { Box, color, DataField, Grid, Row, Text } from '@kroma/ui/kit';
import { IconFileInfo } from '@tabler/icons-react';
import type { CSSProperties, ReactNode } from 'react';

const TOP_RULE = { borderTopWidth: 1, borderTopColor: color('white/6') } as const;
const BOTTOM_RULE = { borderBottomWidth: 1, borderBottomColor: color('white/6') } as const;
const GLYPH = { marginTop: 2, flexShrink: 0 } as const;
const NO_CAPS = { textTransform: 'none' } as const;
// `word-break` inherits, and React Native's TextStyle has no name for it.
const PATH: CSSProperties = { wordBreak: 'break-all' };

export function FileCard({
  file,
  index,
  multi,
}: Readonly<{ file: MediaFile; index: number; multi: boolean }>) {
  const t = useT();
  const fmt = useFormat();
  return (
    <Box overflow="hidden" radius="xl" border="white/8" bg="white/2">
      <FileHeader file={file} index={index} multi={multi} />

      <Box px={16} py={14}>
        <Grid columns={3} gap={20} rowGap={10}>
          <FileField label={t('mediaInfo.container')} value={file.container.toUpperCase()} />
          <FileField
            label={t('mediaInfo.size')}
            value={file.size != null ? fmt.bytes(file.size) : '-'}
          />
          <FileField
            label={t('mediaInfo.duration')}
            value={file.durationMs != null ? fmt.duration(file.durationMs) : '-'}
          />
        </Grid>
      </Box>

      {file.probed ? <FileTracks file={file} /> : <Unprobed />}
    </Box>
  );
}

function FileHeader({
  file,
  index,
  multi,
}: Readonly<{ file: MediaFile; index: number; multi: boolean }>) {
  const t = useT();
  const name = file.relPath?.split('/').pop() ?? t('mediaInfo.unknownFile');
  return (
    <Box row align="flex-start" gap={12} px={16} py={12} style={BOTTOM_RULE}>
      <IconFileInfo size={18} stroke={1.9} color={color('white/40')} style={GLYPH} />
      <Box minW={0} flex>
        <Row wrap gap={8}>
          <Text variant="label" lines={1}>
            {name}
          </Text>
          {multi ? <Chip>{`#${index + 1}`}</Chip> : null}
          {file.edition ? <Chip accent>{file.edition}</Chip> : null}
        </Row>
        {file.relPath ? (
          <div style={PATH}>
            <Text variant="meta" font="mono" color="white/35" mt={2}>
              {file.relPath}
            </Text>
          </div>
        ) : null}
      </Box>
    </Box>
  );
}

function Unprobed() {
  const t = useT();
  return (
    <Box px={16} py={12} style={TOP_RULE}>
      <Text variant="meta" color="accent/80">
        {t('mediaInfo.unprobed')}
      </Text>
    </Box>
  );
}

function FileTracks({ file }: Readonly<{ file: MediaFile }>) {
  const t = useT();
  // Legacy rows carry a single top-level audio stream instead of the track list.
  const fallbackAudio = file.audio ? [file.audio] : [];
  const audio = file.audioTracks.length > 0 ? file.audioTracks : fallbackAudio;
  return (
    <>
      <Section label={t('mediaInfo.video')}>
        {file.video ? <VideoLine video={file.video} /> : <Muted>{'-'}</Muted>}
      </Section>

      <Section label={t('mediaInfo.audio')}>
        {audio.length ? (
          audio.map((a) => <AudioLine key={`audio-${a.index}`} track={a} />)
        ) : (
          <Muted>{'-'}</Muted>
        )}
      </Section>

      <Section label={t('mediaInfo.subtitles')} last>
        {file.subtitles.length ? (
          file.subtitles.map((s) => (
            <SubtitleLine key={`sub-${s.language ?? 'und'}-${s.codec}`} track={s} />
          ))
        ) : (
          <Muted>{t('mediaInfo.noSubs')}</Muted>
        )}
      </Section>
    </>
  );
}

function VideoLine({ video }: Readonly<{ video: VideoTrack }>) {
  const t = useT();
  return (
    <TrackLine
      parts={[
        codecLabel(video.codec),
        video.width && video.height ? `${video.width}×${video.height}` : null,
        video.hdr ? 'HDR' : null,
        video.bitDepth ? `${video.bitDepth} ${t('mediaInfo.bit')}` : null,
      ]}
    />
  );
}

function AudioLine({ track }: Readonly<{ track: AudioTrack }>) {
  const t = useT();
  return (
    <TrackLine
      badge={track.default ? t('mediaInfo.default') : null}
      parts={[
        langName(t, track.language) ?? track.language ?? null,
        codecLabel(track.codec),
        channelLabel(track.channels),
        track.title ?? null,
      ]}
    />
  );
}

function SubtitleLine({ track }: Readonly<{ track: SubtitleTrack }>) {
  const t = useT();
  return (
    <TrackLine
      parts={[langName(t, track.language) ?? track.language ?? null, codecLabel(track.codec)]}
    />
  );
}

function Section({
  label,
  last,
  children,
}: Readonly<{ label: string; last?: boolean; children: ReactNode }>) {
  return (
    <Box px={16} py={12} style={last ? undefined : BOTTOM_RULE}>
      <Text variant="overline" color="white/35" mb={6}>
        {label}
      </Text>
      <Box gap={4}>{children}</Box>
    </Box>
  );
}

function TrackLine({
  parts,
  badge,
}: Readonly<{ parts: (string | null | undefined)[]; badge?: string | null }>) {
  const shown = parts.filter((p): p is string => !!p && p.length > 0).join('  ·  ');
  return (
    <Box row wrap align="center" gapX={8} gapY={4}>
      {badge ? <Chip accent>{badge}</Chip> : null}
      <Text variant="meta" color="white/75">
        {shown}
      </Text>
    </Box>
  );
}

function FileField({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <DataField.Root size="sm">
      <DataField.Label>{label}</DataField.Label>
      <DataField.Value lines={1}>{value}</DataField.Value>
    </DataField.Root>
  );
}

function Chip({ children, accent }: Readonly<{ children: string; accent?: boolean }>) {
  return (
    <Box radius="pill" px={6} py={2} bg={accent ? 'accent/20' : 'white/8'}>
      <Text variant="overline" color={accent ? 'accent' : 'white/50'} style={NO_CAPS}>
        {children}
      </Text>
    </Box>
  );
}

function Muted({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <Text variant="meta" color="white/35">
      {children}
    </Text>
  );
}
