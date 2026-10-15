import type { Arrival } from '@kromatv/core';
import { Box } from '#ui/components/atoms/box';
import { ArrivalBadge } from './arrival-badge';

export function arriving(share: number): Arrival {
  return {
    progress: share,
    share: { label: 'Téléchargé', text: `${Math.round(share * 100)}%` },
    readings: [
      { key: 'downloaded', label: 'Téléchargé', text: `${Math.round(share * 100)}%` },
      { key: 'speed', label: 'Vitesse', text: '311 KB/s' },
      { key: 'sources', label: 'Pairs', text: '31 / 498' },
    ],
    rate: { bps: 318_000, text: '311 KB/s' },
    slices: [],
    arriving: [],
    mapLabel: null,
  };
}

export function OverFilm({
  shares,
  scale,
}: Readonly<{ shares: readonly number[]; scale?: number }>) {
  return (
    <Box bg="black" px={20} py={14} radius="xl" gap={12} self="flex-start">
      {shares.map((share) => (
        <ArrivalBadge key={share} arrival={arriving(share)} scale={scale} />
      ))}
    </Box>
  );
}
