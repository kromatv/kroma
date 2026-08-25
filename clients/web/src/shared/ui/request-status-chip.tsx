// The request status chip, one component for every surface: poster-card
// overlay, table rows and the discover-detail hero.

import type { RequestStatus } from '@kroma/core';
import { useT } from '@kroma/ui';
import { Box, backdropBlur, Row, Text, useLoop } from '@kroma/ui/kit';
import { requestStatusMeta } from '#web/shared/lib/request-status';

const PULSE_MS = 2000;
const RING_MS = 500;

function Ring({ value, size, color }: Readonly<{ value: number; size: number; color: string }>) {
  const sw = size <= 12 ? 2 : 2.5;
  const r = (size - sw) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.max(0, Math.min(1, value)));
  const c = size / 2;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}
      aria-hidden="true"
    >
      <circle
        cx={c}
        cy={c}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={sw}
        opacity={0.28}
      />
      <circle
        cx={c}
        cy={c}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={sw}
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        style={{ transition: `stroke-dashoffset ${RING_MS}ms` }}
      />
    </svg>
  );
}

const SHAPE = {
  card: { dot: 4, ring: 11, gap: 4, px: 8, py: 3 },
  row: { dot: 6, ring: 13, gap: 6, px: 11, py: 5 },
  hero: { dot: 8, ring: 16, gap: 8, px: 16, py: 8 },
} as const;

const BOLD = { fontWeight: '700' } as const;

const TABULAR = { fontVariant: ['tabular-nums' as const] };

const CARD_FROST = backdropBlur(6);

export function RequestStatusChip({
  status,
  size = 'row',
  progress,
}: Readonly<{
  status: RequestStatus;
  size?: 'card' | 'row' | 'hero';
  progress?: number | null;
}>) {
  const t = useT();
  const m = requestStatusMeta(status);
  const shape = SHAPE[size];
  const downloading = status === 'downloading' && progress != null;
  const pct = downloading ? `${Math.round((progress ?? 0) * 100)}%` : null;
  const pulse = useLoop('pulse', PULSE_MS, m.pulse === true);

  const fill = { backgroundColor: m.bg };
  const lead = downloading ? (
    <Ring value={progress ?? 0} size={shape.ring} color={m.dot} />
  ) : (
    <Box
      w={shape.dot}
      h={shape.dot}
      shrink={0}
      radius="circle"
      style={[{ backgroundColor: m.dot }, pulse]}
    />
  );

  if (size === 'card') {
    return (
      <Row
        self="flex-start"
        gap={shape.gap}
        px={shape.px}
        py={shape.py}
        radius="pill"
        bg="bg/72"
        style={CARD_FROST}
      >
        {lead}
        <Text variant="overline" color={m.color}>
          {pct ?? t(m.labelKey)}
        </Text>
      </Row>
    );
  }

  return (
    <Row self="flex-start" gap={shape.gap} px={shape.px} py={shape.py} radius="pill" style={fill}>
      {lead}
      <Text variant={size === 'hero' ? 'label' : 'meta'} color={m.color} style={BOLD}>
        {t(m.labelKey)}
      </Text>
      {pct ? (
        <Text variant={size === 'hero' ? 'label' : 'meta'} color={m.color} style={[BOLD, TABULAR]}>
          {pct}
        </Text>
      ) : null}
    </Row>
  );
}
