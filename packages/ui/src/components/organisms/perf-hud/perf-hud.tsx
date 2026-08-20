// The performance HUD: frame timings, focus response, heap and surface size,
// read on the television they are about. Turned on in the device settings.

import { artworkScaleValue } from '@kroma/core';
import { useEffect, useState } from 'react';
import { Dimensions, PixelRatio } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Text } from '#ui/components/atoms/text';
import { styles } from '#ui/core';
import { type PerfReport, perfReport, startPerf, stopPerf } from '#ui/lib/perf';
import { PerfChart } from './perf-chart';

// Slow enough to read, fast enough to blame the thing you just did.
const REFRESH_MS = 500;

function PerfHud({ enabled }: Readonly<{ enabled: boolean }>) {
  const [report, setReport] = useState<PerfReport | null>(null);

  useEffect(() => {
    if (!enabled) return;
    startPerf();
    const timer = setInterval(() => setReport(perfReport()), REFRESH_MS);
    return () => {
      clearInterval(timer);
      stopPerf();
    };
  }, [enabled]);

  if (!enabled || !report) return null;
  return (
    <Box absolute style={s.panel}>
      <Row label="FPS" value={String(report.fps)} bad={report.fps < 45} />
      <Row label="WORST" value={`${report.worstFrame} ms`} bad={report.worstFrame > 50} />
      <Row label="JANK" value={String(report.jankyFrames)} bad={report.jankyFrames > 0} />
      <Row
        label="RESPONSE"
        value={report.responseCount ? `${report.responseP50} / ${report.responseWorst} ms` : '-'}
        bad={report.responseP50 > 120}
      />
      <PerfChart frames={report.frames} />
      <Row label="HEAP" value={heapText(report)} bad={isHeapTight(report)} />
      <Row label="FOCUS" value={report.gridCell} bad={false} />
      <Row label="SCREEN" value={screenText()} bad={false} />
      <Row label="ART" value={`${Math.round(artworkScaleValue() * 100)}%`} bad={false} />
    </Box>
  );
}

/** Nothing rather than a zero: an engine that reports no heap has not told us
 *  it is using none. */
function heapText(report: PerfReport): string {
  if (!report.heapMb) return '-';
  return report.heapLimitMb ? `${report.heapMb} / ${report.heapLimitMb} MB` : `${report.heapMb} MB`;
}

// Four fifths of what the engine will give is where a Chromium tab starts
// collecting hard rather than growing.
const HEAP_TIGHT = 0.8;

function isHeapTight(report: PerfReport): boolean {
  return report.heapLimitMb > 0 && report.heapMb / report.heapLimitMb > HEAP_TIGHT;
}

/** The surface in DEVICE pixels, which is what the GPU fills, and the ratio it
 *  came from: `1920x1080 @1x` costs a quarter of `3840x2160 @2x`. */
function screenText(): string {
  const { width, height } = Dimensions.get('window');
  const ratio = PixelRatio.get();
  return `${Math.round(width * ratio)}x${Math.round(height * ratio)} @${ratio}x`;
}

function Row({ label, value, bad }: Readonly<{ label: string; value: string; bad: boolean }>) {
  return (
    <Box row between gap={16}>
      <Text style={s.label} color="textDim">
        {label}
      </Text>
      <Text style={s.value} color={bad ? 'danger' : 'success'}>
        {value}
      </Text>
    </Box>
  );
}

const s = styles({
  panel: {
    pointerEvents: 'none',
    top: 24,
    right: 24,
    z: 999,
    minW: 260,
    gap: 4,
    py: 12,
    px: 16,
    radius: 'md',
    bg: 'bg/86',
    border: 'border',
  },
  label: { fontSize: 13, fontWeight: '700', letterSpacing: 1 },
  value: { fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
});

export { PerfHud };
