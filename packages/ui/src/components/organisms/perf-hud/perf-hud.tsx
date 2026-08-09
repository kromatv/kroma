// The performance HUD: the numbers, on the screen they are about.
//
// A television is the only place these numbers mean anything, and it is the one
// place a profiler is hardest to attach - Samsung blocks the log, the simulator
// lies about the CPU, and a laptop browser is ten times too fast. So the app
// carries its own read-out: turn it on in the device settings, walk the remote
// around, and read what the viewer is actually getting.
//
// What to look at, in order:
//   RESPONSE   press-to-focus. Over ~120ms the remote feels heavy, whatever the
//             frame rate says.
//   WORST     the worst frame in the window. One 200ms frame is a visible jolt
//             even at "60 fps" on average.
//   JANK      how many frames blew two 60Hz budgets. Zero is the target.

import { useEffect, useState } from 'react';
import { Box } from '#ui/components/atoms/box';
import { Txt } from '#ui/components/atoms/text';
import { styles } from '#ui/core';
import { type PerfReport, perfReport, startPerf, stopPerf } from '#ui/lib/perf';

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
    </Box>
  );
}

function Row({ label, value, bad }: Readonly<{ label: string; value: string; bad: boolean }>) {
  return (
    <Box row between gap={16}>
      <Txt style={s.label} color="textDim">
        {label}
      </Txt>
      <Txt style={s.value} color={bad ? 'danger' : 'success'}>
        {value}
      </Txt>
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
