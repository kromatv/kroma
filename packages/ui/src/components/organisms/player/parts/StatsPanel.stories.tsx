import { story } from '@kroma/workbench/story';
import type { ReactNode } from 'react';
import { Box } from '#ui/components/atoms/box';
import { fakeController, liveMeters, TV_STATS } from '../player.fixture';
import type { PlayerStats } from '../types';
import { StatsPanel } from './StatsPanel';

/**
 * The player surface the panel is positioned against. The panel pins itself
 * 34pt from the left and 100pt from the top and carries its own width, so all
 * the story owes it is a surface deep enough to be read in - and no width of its
 * own, which the canvas is already deciding (see `width` below).
 */
function Surface({ children }: Readonly<{ children: ReactNode }>) {
  return <Box minH={620}>{children}</Box>;
}

export default story({
  name: 'PlayerStats',
  group: 'State',
  docs: 'The playback read-out: what the stream actually is, versus what was asked for. It exists because "is this direct-playing?" is the first question about any TV playback problem, and the answer is not visible anywhere else — so `mode` is the headline, above a wrapping run of the stream\'s fixed identity. ONE layout serves every surface: a native TV plane that reports seven fields and the web engine that reports twenty-seven fill more or fewer of the same columns, at the same type and rhythm, rather than switching to a second design. Live series arrive as `meters`; those sharing a `chart` id are drawn on ONE axis, which is only ever legal when they share a unit.',
  usage: `<StatsPanel controller={controller} onClose={() => setStatsOn(false)} />

// Two series on one axis, because the GAP between them is the diagnostic:
meters: [
  { key: 'bandwidth', label: 'Bandwidth', value: kbps, display: '79.7 Mb/s',
    chart: 'throughput', chartLabel: 'Throughput', band: true },
  { key: 'bitrate', label: 'Stream bitrate', value: kbps, display: '55.6 Mb/s',
    chart: 'throughput' },
  // Its own chart: seconds cannot share an axis with kb/s.
  { key: 'buffer', label: 'Buffer', value: sec, display: '28.0 s ahead',
    reference: { value: 10, label: '10 s ahead' } },
]`,
  guidelines: {
    do: [
      'Read `mode` first: direct play versus transcode explains most complaints.',
      'Group two meters on one chart only when they share a unit — the gap between them is then readable as headroom.',
      'Give a meter a `reference` so its trace says whether the value is healthy, not just which way it is moving.',
      'Give an `extra` row a `group` when a platform reports more than a handful.',
      'Leave `color` unset: the panel assigns the validated series palette, which is checked as a set for colourblind separation.',
    ],
    dont: [
      "Don't put two units on one chart. Buffer (seconds) against bandwidth (kb/s) flattens the smaller series to a dead line and invents a crossover that is not in the data.",
      "Don't report a charted value as an `extra` row as well — the panel drops the duplicate row, and the chart already carries the number plus its history.",
      "Don't leave it open in a shipped session - it polls, and a TV has nothing to spare.",
    ],
  },
  matrix: false,
  // The panel carries its own 768pt width and sits 34pt in, so the floor is what
  // it needs and the range above it is what the surface behind it can be.
  width: { min: 820, max: 1200 },
  // 768pt of table on a stage that can be 326 (a phone): the scroller shows a
  // third of it. The TV frame shows the whole read-out - which is how it is
  // read - and `Fit` stays one press away.
  viewport: 'tv',
  args: {},
  // The WEB snapshot, which is the richest one any surface builds: headline
  // fields, media / transport / client diagnostics, and three live series. The
  // meters wander on their own, so the charts are drawing here exactly as they do
  // over a real stream - including the window filling in from the right, which is
  // what the first forty seconds of every playback actually looks like.
  render: () => (
    <Surface>
      <StatsPanel controller={fakeController()} onClose={() => {}} />
    </Surface>
  ),
  scenes: [
    {
      name: 'On a television',
      docs: 'What a native plane (AVPlay, mpv, ExoPlayer) can report: no decode counters, no engine transport, no series to graph. This is the case that used to be a SECOND design — a stacked list, because a dozen rows in three columns looked empty. Now it is the same design with less in it: the same headline, the same wrapping summary, and the columns and charts simply absent. Nothing here is a special case.',
      render: () => (
        <Surface>
          <StatsPanel
            controller={fakeController({ getStats: () => TV_STATS })}
            onClose={() => {}}
          />
        </Surface>
      ),
    },
    {
      name: 'Transcoding',
      docs: 'The same panel when the server had to re-encode: the line a support conversation starts from.',
      render: () => (
        <Surface>
          <StatsPanel
            controller={fakeController({
              getStats: () => ({
                resolution: '1920×1080',
                videoCodec: 'H.264 High',
                fps: '23.976 fps',
                dropped: '14 / 6 720',
                audioFormat: 'AAC 2.0 · 48 kHz',
                bitrate: '8.10 Mb/s',
                buffer: '6.2 s ahead',
                mode: 'Transcode (HEVC unsupported)',
                extra: [
                  { group: 'Why', label: 'Video', value: 'HEVC not decodable by this client' },
                  { group: 'Why', label: 'Audio', value: 'TrueHD downmixed to AAC 2.0' },
                  { group: 'Why', label: 'Cost', value: 'CPU · ~1.4× realtime' },
                ],
              }),
            })}
            onClose={() => {}}
          />
        </Surface>
      ),
    },
    {
      name: 'Running out of headroom',
      docs: 'The case the throughput chart exists for. Bandwidth is falling toward the bitrate the stream needs and the buffer is draining toward its floor — a stall in a few seconds. The band between the two traces closing is what says so at a glance; as two separately auto-scaled sparklines, which is what these were, both looked like their usual gentle wobble right up to the freeze.',
      render: () => (
        <Surface>
          <StatsPanel
            controller={fakeController({ getStats: starvingStats() })}
            onClose={() => {}}
          />
        </Surface>
      ),
    },
  ],
});

// A stream losing its connection: bandwidth sliding under the bitrate it needs
// while the buffer drains. Deterministic in its own tick, so the scene captures
// identically every time.
function starvingStats(): () => PlayerStats {
  let tick = 0;
  return () => {
    const at = tick++;
    // Bandwidth decays past the stream's demand; buffer follows it down, slower,
    // the way a real buffer drains once supply drops below demand.
    const bandwidth = 46_000 - Math.min(at, 60) * 460;
    const bitrate = 28_400 + Math.sin(at / 6) * 900;
    const buffer = Math.max(0.4, 22 - Math.min(at, 70) * 0.3);
    return {
      mode: 'Direct · HEVC passthrough',
      resolution: '3840×2160',
      videoCodec: 'HEVC Main 10 10-bit HDR',
      fps: '23.98 fps',
      audioFormat: 'EAC3 5.1 (eng)',
      dropped: `${18 + Math.floor(at / 8)} / ${42_000 + at * 24}`,
      extra: [
        { group: 'Transport', label: 'Stalls', value: `${Math.floor(at / 20)} (2.4s)` },
        { group: 'Transport', label: 'Downloaded', value: `${(4.2 + at / 90).toFixed(2)} Go` },
        { group: 'Client', label: 'State', value: 'HAVE_FUTURE · NET_LOADING' },
        { group: 'Client', label: 'Connection', value: '3.1 Mb/s · 4g' },
      ],
      meters: liveMeters({ bandwidth, bitrate, buffer }),
    };
  };
}
