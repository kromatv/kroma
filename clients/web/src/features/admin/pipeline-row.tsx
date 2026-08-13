// One element row in the pipeline table: poster, title + kind badge, a subtitle
// (metadata, or the failing/running stage), the treatment "flow" of status dots,
// the overall status pill, and a reprocess shortcut.

import type { ElementRow, MessageKey, Translate, Treatment } from '@kroma/core';
import { Table } from '@kroma/module-sdk';
import { useT } from '@kroma/ui';
import { Box, type ColorValue, Icon, Row, Spinner, Text, Tooltip } from '@kroma/ui/kit';
import { Pill, PillDot } from '#web/features/admin/pill';
import {
  fmtDur,
  kindMeta,
  overallMeta,
  posterGrad,
  statusMeta,
} from '#web/features/admin/pipeline-meta';
import { useAuth } from '#web/shared/lib/auth';
import { Image } from '#web/shared/ui';

function subLine(t: Translate, el: ElementRow): { text: string; color: ColorValue } {
  const names = (pred: (x: Treatment) => boolean) =>
    el.treatments
      .filter(pred)
      .map((x) => t(`pipeline.t.${x.key}` as MessageKey))
      .join(', ');
  if (el.overall === 'failed') {
    return {
      text: `${t('pipeline.st.failed')} : ${names((x) => x.status === 'failed')}`,
      color: 'dangerHover',
    };
  }
  if (el.overall === 'running') {
    return {
      text: `${t('pipeline.st.running')} : ${names((x) => x.status === 'running')}`,
      color: 'text/60',
    };
  }
  const dur = fmtDur(el.durationMs);
  let text: string;
  if (el.kind === 'series') {
    text = [el.genre, el.seasonCount ? `${el.seasonCount} ${t('pipeline.seasons')}` : '']
      .filter(Boolean)
      .join(' · ');
  } else if (el.kind === 'episode') {
    text = [t('pipeline.type.episode'), dur].filter(Boolean).join(' · ');
  } else {
    text = [el.year ? String(el.year) : '', el.genre, dur].filter(Boolean).join(' · ');
  }
  return { text, color: 'text/50' };
}

function Poster({
  id,
  kind,
  seed,
  poster,
}: Readonly<{ id: string; kind: string; seed: string; poster?: string | null }>) {
  const { client } = useAuth();
  // Prefer the cached TMDB poster; fall back to the by-id endpoint, then the
  // gradient placeholder (onError) if neither has real art.
  const src =
    (poster ? client.resolveArt(poster) : null) ??
    (kind === 'series' ? client.showPosterUrl(id) : client.posterUrl(id));
  return (
    <Box w={32} h={46} shrink={0} radius={4} overflow="hidden" shadow="card">
      <div style={{ position: 'absolute', inset: 0, background: posterGrad(seed) }} />
      <Image src={src} fit="cover" fill />
    </Box>
  );
}

function FlowDot({ treatment }: Readonly<{ treatment: Treatment }>) {
  const t = useT();
  const m = statusMeta(treatment.status);
  const name = t(`pipeline.t.${treatment.key}` as MessageKey);
  const state = t(`pipeline.st.${treatment.status}` as MessageKey);
  return (
    <Tooltip label={`${name} - ${state}`}>
      <Row
        center
        w={19}
        h={19}
        shrink={0}
        radius="circle"
        bg={m.bg}
        border={m.ring}
        accessibilityLabel={`${name} - ${state}`}
      >
        {treatment.status === 'done' ? (
          <Icon name="check" size={11} thickness={3.2} color={m.color} />
        ) : null}
        {treatment.status === 'failed' ? (
          <Icon name="x" size={10} thickness={3.4} color={m.color} />
        ) : null}
        {treatment.status === 'running' ? (
          <Spinner size={11} thickness={2} color={m.color} />
        ) : null}
        {treatment.status === 'pending' || treatment.status === 'missing' ? (
          <PillDot tone={m.color} />
        ) : null}
      </Row>
    </Tooltip>
  );
}

function FlowDots({ treatments }: Readonly<{ treatments: Treatment[] }>) {
  return (
    <Table.Cell wide row>
      {treatments.map((tr, i) => (
        <Row key={tr.key}>
          {i > 0 ? (
            <Box
              w={12}
              h={2}
              shrink={0}
              radius="pill"
              bg={treatments[i - 1]?.status === 'done' ? 'success' : 'tint/12'}
            />
          ) : null}
          <FlowDot treatment={tr} />
        </Row>
      ))}
    </Table.Cell>
  );
}

export function ElementRowView({
  el,
  onOpen,
  onReprocess,
}: Readonly<{ el: ElementRow; onOpen: () => void; onReprocess: () => void }>) {
  const t = useT();
  const km = kindMeta(el.kind);
  const om = overallMeta(el.overall);
  const sub = subLine(t, el);

  return (
    <Table.Row onPress={onOpen}>
      <Table.Cell row gap={14}>
        <Poster id={el.id} kind={el.kind} seed={el.title} poster={el.poster} />
        <Box minW={0}>
          <Row gap={10}>
            <Text variant="label" lines={1}>
              {el.title}
            </Text>
            <Pill ink={km.color} bg={km.bg} variant="overline">
              {t(`pipeline.type.${km.typeKey}` as MessageKey)}
            </Pill>
          </Row>
          <Text variant="meta" color={sub.color} lines={1} mt={3}>
            {sub.text}
          </Text>
        </Box>
      </Table.Cell>

      <FlowDots treatments={el.treatments} />

      <Table.Cell wide>
        <Pill ink={om.color} bg={om.bg} leading={<PillDot tone={om.dot} pulse={om.pulse} />}>
          {t(`pipeline.overall.${el.overall}` as MessageKey)}
        </Pill>
      </Table.Cell>

      <Table.Cell row justify="flex-end">
        <Table.Action
          tone="accent"
          icon="refresh"
          label={t('pipeline.reprocessItem')}
          onPress={onReprocess}
        />
      </Table.Cell>
    </Table.Row>
  );
}
