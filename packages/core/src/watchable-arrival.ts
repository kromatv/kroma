import type { CapabilityFigureKind, CapabilitySource } from '@kromatv/client/capabilities';
import type { WatchableFigure, WatchableProgress } from '@kromatv/client/watchable';
import type { Locale, Translate } from '@kromatv/i18n';
import { formatBytes, formatCount, formatShare } from './intl';
import { impliedSource } from './watchable-source';

export interface ArrivalReading {
  key: string;
  label: string;
  text: string;
}

export interface Arrival {
  progress: number;
  readings: readonly ArrivalReading[];
  share: { label: string; text: string };
  rate: { bps: number; text: string } | null;
  slices: readonly number[];
  arriving: readonly number[];
  mapLabel: string | null;
}

const IMPLIED: Record<string, (progress: WatchableProgress) => WatchableFigure> = {
  downloaded: (progress) => progress.progress,
  speed: (progress) => progress.downBps,
  sources: (progress) => [progress.peers, progress.peersSeen],
};

function figureValue(progress: WatchableProgress, key: string): WatchableFigure | null {
  return progress.figures[key] ?? IMPLIED[key]?.(progress) ?? null;
}

function figureText(
  kind: CapabilityFigureKind,
  value: WatchableFigure,
  locale: Locale,
): string | null {
  switch (kind) {
    case 'text':
      return typeof value === 'string' ? value : null;
    case 'ratio':
      return Array.isArray(value)
        ? `${formatCount(value[0], locale)} / ${formatCount(value[1], locale)}`
        : null;
    case 'percent':
      return typeof value === 'number' ? formatShare(value, locale) : null;
    case 'rate':
      return typeof value === 'number' ? `${formatBytes(value, locale)}/s` : null;
    case 'count':
      return typeof value === 'number' ? formatCount(value, locale) : null;
    default: {
      const unreachable: never = kind;
      return unreachable;
    }
  }
}

function readingsOf(
  source: CapabilitySource,
  progress: WatchableProgress,
  locale: Locale,
): ArrivalReading[] {
  const readings: ArrivalReading[] = [];
  for (const figure of source.figures) {
    const value = figureValue(progress, figure.key);
    if (value === null) continue;
    const text = figureText(figure.kind, value, locale);
    if (text !== null) readings.push({ key: figure.key, label: figure.label, text });
  }
  return readings;
}

function shareOf(
  declared: CapabilitySource,
  readings: readonly ArrivalReading[],
  fraction: number,
  t: Translate,
  locale: Locale,
): { label: string; text: string } {
  const percent = declared.figures.find((figure) => figure.kind === 'percent');
  const reading = readings.find((candidate) => candidate.key === percent?.key);
  if (reading) return { label: reading.label, text: reading.text };
  return {
    label: percent?.label ?? t('requests.watchStatDownloaded'),
    text: formatShare(fraction, locale),
  };
}

/**
 * A source that declares nothing, and a payload carrying only the older field
 * names, both read back as the three figures and the map every download used to
 * send.
 */
export function arrivalOf({
  source,
  progress,
  t,
  locale,
}: Readonly<{
  source: CapabilitySource | null;
  progress: WatchableProgress | null;
  t: Translate;
  locale: Locale;
}>): Arrival {
  const declared = source ?? impliedSource('', t);
  const readings = progress ? readingsOf(declared, progress, locale) : [];
  const rated = declared.figures.find((figure) => figure.kind === 'rate');
  const bps = rated && progress ? figureValue(progress, rated.key) : null;
  const text = readings.find((reading) => reading.key === rated?.key)?.text;
  const mapLabel = declared.map?.label ?? null;
  const fraction = progress?.progress ?? 0;
  return {
    progress: fraction,
    readings,
    share: shareOf(declared, readings, fraction, t, locale),
    rate: typeof bps === 'number' && text !== undefined ? { bps, text } : null,
    slices: mapLabel && progress ? (progress.slices ?? progress.pieces) : [],
    arriving: mapLabel && progress ? progress.arriving : [],
    mapLabel,
  };
}
