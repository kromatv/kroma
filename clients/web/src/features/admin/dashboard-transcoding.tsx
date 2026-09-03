// What the box is re-encoding right now. The rest of the dashboard shows what a
// viewer asked for; this shows what the server had to spend to answer, which
// until now was invisible: a remux is a child ffmpeg, so the CPU chart read as
// idle while the machine sat at 100%.

import type { LiveTranscode, Transcodes } from '@kroma/client/admin';
import { TABULAR } from '@kroma/module-sdk';
import { useFormat, useT } from '@kroma/ui';
import {
  Box,
  type ColorValue,
  DataField,
  Divider,
  EmptyState,
  Icon,
  Row,
  Section,
  Surface,
  Text,
} from '@kroma/ui/kit';
import { Pill, PillDot } from '#web/features/admin/pill';

// Below this the encoder is producing less than a second of film per second and
// the player will run dry; `-readrate` caps a healthy session at 2.0x, so the
// warning band is the stretch where it has stopped keeping its lead.
const FALLING_BEHIND = 1;
const NO_LEAD = 1.3;

type Tone = { ink: ColorValue; bg: ColorValue };

const OK: Tone = { ink: 'success', bg: 'success/14' };
const WARN: Tone = { ink: 'accent', bg: 'accentWash/16' };
const BAD: Tone = { ink: 'danger', bg: 'danger/14' };

function speedTone(speed: number): Tone {
  if (speed <= 0) return { ink: 'textMuted', bg: 'tint/6' };
  if (speed < FALLING_BEHIND) return BAD;
  return speed < NO_LEAD ? WARN : OK;
}

function frame(w?: number | null, h?: number | null) {
  return w && h ? `${w}×${h}` : null;
}

// `h264-1080` is the wire token; what an operator wants to read is the box the
// picture is being fitted into.
function pictureLabel(s: LiveTranscode, t: ReturnType<typeof useT>) {
  if (!s.transcodesVideo) return t('admin.tcVideoCopy');
  const from = frame(s.sourceWidth, s.sourceHeight);
  const to = frame(s.targetWidth, s.targetHeight);
  if (from && to) return `${from} → ${to}`;
  return to ?? t('admin.tcVideoReencode');
}

function soundLabel(s: LiveTranscode, t: ReturnType<typeof useT>) {
  if (!s.transcodesAudio) return t('admin.tcAudioCopy');
  return s.audio === 'aac' ? 'AAC' : `AAC · ${s.audio.replace('aac-', '')}`;
}

function title(s: LiveTranscode, t: ReturnType<typeof useT>) {
  const name = s.showTitle ?? s.title;
  if (!name) return t('admin.tcUnknownTitle');
  if (s.season == null) return name;
  return `${name} · ${t('admin.episodeShort', { season: s.season, episode: s.episode ?? '' })}`;
}

/** The line that says which silicon the host settled on, and why. A device that
 *  is present, listed and unusable looks exactly like no device at all, so the
 *  reason is the half an operator can act on. */
function HardwareLine({ hardware }: Readonly<Pick<Transcodes, 'hardware'>>) {
  const t = useT();
  const tone = hardware.accelerated ? OK : WARN;
  return (
    <Row gap={10} wrap>
      <Pill ink={tone.ink} bg={tone.bg} leading={<Icon name="cpu" size={13} color={tone.ink} />}>
        {hardware.accel}
      </Pill>
      <Text variant="meta" color="textDim" lines={2}>
        {hardware.accelerated ? hardware.reason : t('admin.tcSoftwareWarning')}
      </Text>
    </Row>
  );
}

function TranscodeRow({ s }: Readonly<{ s: LiveTranscode }>) {
  const t = useT();
  const fmt = useFormat();
  const tone = speedTone(s.speed);
  const heavy = s.transcodesVideo && s.onTheCpu;

  return (
    <Surface elevated pad="none" radius={16} border="border" px={20} py={16} gap={12}>
      <Row between align="flex-start" gap={16}>
        <Box minW={0} gap={4}>
          <Text variant="title" lines={1}>
            {title(s, t)}
          </Text>
          <Text variant="meta" color="textDim">
            {pictureLabel(s, t)} · {soundLabel(s, t)}
          </Text>
        </Box>
        <Row gap={8} shrink={0}>
          {heavy ? (
            <Pill ink={WARN.ink} bg={WARN.bg}>
              {t('admin.tcOnTheCpu')}
            </Pill>
          ) : null}
          <Pill ink={tone.ink} bg={tone.bg} leading={<PillDot tone={tone.ink} pulse={s.running} />}>
            {s.speed > 0 ? `${fmt.decimal(s.speed, 2)}×` : t('admin.tcStarting')}
          </Pill>
        </Row>
      </Row>

      {s.speed > 0 && s.speed < FALLING_BEHIND ? (
        <Row gap={8} radius={8} bg="danger/10" px={12} py={8}>
          <Icon name="alert-triangle" size={14} color="danger" />
          <Text variant="meta" color="danger">
            {t('admin.tcTooSlow')}
          </Text>
        </Row>
      ) : null}

      <Divider />
      <Row wrap gapX={26} gapY={10}>
        <DataField.Root size="sm">
          <DataField.Label>{t('admin.tcPipeline')}</DataField.Label>
          <Text variant="meta" color={s.onTheCpu ? 'accent' : 'success'}>
            {s.accel}
            {s.onTheCpu ? ` · ${s.effort}` : ''}
          </Text>
        </DataField.Root>
        <DataField.Root size="sm">
          <DataField.Label>{t('admin.tcCpu')}</DataField.Label>
          <Text variant="meta" color="textMuted" style={TABULAR}>
            {s.cpu == null ? '-' : `${fmt.decimal(s.cpu, 1)} %`}
          </Text>
        </DataField.Root>
        <DataField.Root size="sm">
          <DataField.Label>{t('admin.tcFps')}</DataField.Label>
          <Text variant="meta" color="textMuted" style={TABULAR}>
            {fmt.decimal(s.fps, 1)}
          </Text>
        </DataField.Root>
        <DataField.Root size="sm">
          <DataField.Label>{t('admin.tcProduced')}</DataField.Label>
          <Text variant="meta" color="textMuted" style={TABULAR}>
            {fmt.timecode(s.outTimeMs)}
          </Text>
        </DataField.Root>
        <DataField.Root size="sm">
          <DataField.Label>{t('admin.tcSegments')}</DataField.Label>
          <Text variant="meta" color="textMuted" style={TABULAR}>
            {s.segments} · {fmt.bytes(s.bytes)}
          </Text>
        </DataField.Root>
        {s.dropped > 0 ? (
          <DataField.Root size="sm">
            <DataField.Label>{t('admin.tcDropped')}</DataField.Label>
            <Text variant="meta" color="danger" style={TABULAR}>
              {s.dropped}
            </Text>
          </DataField.Root>
        ) : null}
      </Row>
    </Surface>
  );
}

export function TranscodingSection({ data }: Readonly<{ data: Transcodes | null }>) {
  const t = useT();
  const fmt = useFormat();
  const sessions = data?.sessions ?? [];

  return (
    <Section.Root mt={28}>
      <Section.Header>
        <Section.Title>{t('admin.transcoding')}</Section.Title>
        <Section.Actions>
          <Text variant="label" color="textMuted">
            {t('admin.tcSummary', {
              live: sessions.length,
              encoding: data?.encoding ?? 0,
              cache: fmt.bytes(data?.cacheBytes ?? 0),
            })}
          </Text>
        </Section.Actions>
      </Section.Header>
      {data ? (
        <Box mb={sessions.length ? 14 : 0}>
          <HardwareLine hardware={data.hardware} />
        </Box>
      ) : null}
      {sessions.length === 0 ? (
        <EmptyState.Root icon="transform">
          <EmptyState.Title>{t('admin.tcNone')}</EmptyState.Title>
        </EmptyState.Root>
      ) : (
        <Box gap={14}>
          {sessions.map((s) => (
            <TranscodeRow key={s.id} s={s} />
          ))}
        </Box>
      )}
    </Section.Root>
  );
}
