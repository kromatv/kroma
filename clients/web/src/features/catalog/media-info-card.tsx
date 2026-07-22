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
import { useT } from '@kroma/ui';
import { IconFileInfo } from '@tabler/icons-react';
import { formatBytes, formatDuration } from '#web/shared/lib/adminFormat';

export function FileCard({
  file,
  index,
  multi,
}: Readonly<{ file: MediaFile; index: number; multi: boolean }>) {
  const t = useT();
  return (
    <div className="overflow-hidden rounded-xl border border-white/8 bg-white/[0.02]">
      <FileHeader file={file} index={index} multi={multi} />

      <dl className="grid grid-cols-2 gap-x-5 gap-y-2.5 px-4 py-3.5 sm:grid-cols-3">
        <Field label={t('mediaInfo.container')} value={file.container.toUpperCase()} />
        <Field
          label={t('mediaInfo.size')}
          value={file.size != null ? formatBytes(file.size) : '-'}
        />
        <Field
          label={t('mediaInfo.duration')}
          value={file.durationMs != null ? formatDuration(file.durationMs) : '-'}
        />
      </dl>

      {file.probed ? <FileTracks file={file} /> : <Unprobed />}
    </div>
  );
}

/** File name + full relative path, with the edition / "#n of many" chips. */
function FileHeader({
  file,
  index,
  multi,
}: Readonly<{ file: MediaFile; index: number; multi: boolean }>) {
  const t = useT();
  const name = file.relPath?.split('/').pop() ?? t('mediaInfo.unknownFile');
  return (
    <div className="flex items-start gap-3 border-b border-white/[0.06] px-4 py-3">
      <IconFileInfo size={18} stroke={1.9} className="mt-0.5 shrink-0 text-white/40" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-[13.5px] font-semibold">{name}</span>
          {multi ? <Chip>#{index + 1}</Chip> : null}
          {file.edition ? <Chip accent>{file.edition}</Chip> : null}
        </div>
        {file.relPath ? (
          <div className="mt-0.5 break-all font-mono text-[11px] text-white/35">{file.relPath}</div>
        ) : null}
      </div>
    </div>
  );
}

/** Shown instead of the stream list for a file ffprobe has not read yet. */
function Unprobed() {
  const t = useT();
  return (
    <p className="border-t border-white/[0.06] px-4 py-3 text-[12px] text-amber-300/80">
      {t('mediaInfo.unprobed')}
    </p>
  );
}

/** The three stream sections of a probed file. */
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
}: Readonly<{ label: string; last?: boolean; children: React.ReactNode }>) {
  return (
    <div className={`px-4 py-3 ${last ? '' : 'border-b border-white/[0.06]'}`}>
      <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[.12em] text-white/35">
        {label}
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

/** A dot-separated technical line, skipping the parts that are unknown. */
function TrackLine({
  parts,
  badge,
}: Readonly<{ parts: (string | null | undefined)[]; badge?: string | null }>) {
  const shown = parts.filter((p): p is string => !!p && p.length > 0).join('  ·  ');
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-white/75">
      {badge ? <Chip accent>{badge}</Chip> : null}
      <span>{shown}</span>
    </div>
  );
}

function Field({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-bold uppercase tracking-[.1em] text-white/35">{label}</dt>
      <dd className="mt-0.5 truncate text-[13px] text-white/85">{value}</dd>
    </div>
  );
}

function Chip({ children, accent }: Readonly<{ children: React.ReactNode; accent?: boolean }>) {
  return (
    <span
      className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
        accent ? 'bg-accent/20 text-accent' : 'bg-white/8 text-white/50'
      }`}
    >
      {children}
    </span>
  );
}

function Muted({ children }: Readonly<{ children: React.ReactNode }>) {
  return <span className="text-[12.5px] text-white/35">{children}</span>;
}
