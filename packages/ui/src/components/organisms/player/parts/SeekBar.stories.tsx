import { formatTimecode } from '@kroma/core';
import { story } from '@kroma/workbench/story';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Box } from '#ui/components/atoms/box';
import { stillArt } from '#ui/lib/sample-art';
import { currentChapter } from '../lib/chapters';
import { fakeTileAt } from '../player.fixture';
import type { Chapter } from '../types';
import { SeekBar } from './SeekBar';

const CHAPTERS: Chapter[] = [
  { startMs: 0, endMs: 96_000, title: 'Cold open', kind: 'intro' },
  { startMs: 96_000, endMs: 2_760_000, title: 'Act one', kind: 'chapter' },
  { startMs: 2_760_000, endMs: 5_940_000, title: 'Act two', kind: 'chapter' },
  { startMs: 5_940_000, endMs: 9_180_000, title: 'Act three', kind: 'chapter' },
  { startMs: 9_180_000, endMs: 9_840_000, title: 'Credits', kind: 'credits' },
];

interface ScrubbableProps {
  cur: number;
  dur: number;
  bufEnd: number;
  focused: boolean;
  endsAt: string;
  withChapters: boolean;
  scrubbing: boolean;
  withPreview: boolean;
}

function Scrubbable({
  cur: curArg,
  dur,
  bufEnd,
  focused,
  endsAt,
  withChapters,
  scrubbing,
  withPreview,
}: Readonly<ScrubbableProps>) {
  const [cur, setCur] = useState(curArg);
  const [preview, setPreview] = useState<number | null>(null);
  useEffect(() => setCur(curArg), [curArg]);

  // The pending position is a ref as well as state so the handlers stay
  // identity-stable and the PanResponder is not rebuilt mid-drag.
  const pending = useRef<number | null>(null);
  const onScrub = useCallback((sec: number) => {
    pending.current = sec;
    setPreview(sec);
  }, []);
  const onScrubCommit = useCallback(() => {
    if (pending.current != null) setCur(pending.current);
    pending.current = null;
    setPreview(null);
  }, []);

  const chapters = withChapters ? CHAPTERS : [];
  const seekPreview = preview ?? (scrubbing ? Math.min(dur, cur + 900) : null);
  const shown = seekPreview ?? cur;

  return (
    <Box flex justify="flex-end" px={34} pb={60}>
      <SeekBar
        cur={cur}
        dur={dur}
        bufEnd={bufEnd}
        chapters={chapters}
        seekPreview={seekPreview}
        focused={focused}
        elapsed={formatTimecode(shown)}
        chapterLabel={currentChapter(chapters, shown * 1000)?.title ?? ''}
        total={formatTimecode(dur)}
        endsAt={endsAt}
        tileAt={
          withPreview
            ? fakeTileAt([stillArt(0), stillArt(1), stillArt(2), stillArt(3)])
            : () => null
        }
        onScrub={onScrub}
        onScrubCommit={onScrubCommit}
      />
    </Box>
  );
}

export default story({
  name: 'SeekBar',
  group: 'Player',
  docs: 'The progress bar, aware of what it is scrubbing through. Each chapter is its OWN segment with its own played fill and buffered zone, so the shape of the film is visible before you touch it — and the intro and credits segments are tinted, which is what makes "skip the recap" a target rather than a guess. With no chapter data it degrades to one continuous segment rather than disappearing. `seekPreview` is the pending scrub position: the bar shows where you are *going*, while playback stays where it is.',
  usage: `<SeekBar
  cur={controller.cur}
  dur={controller.dur}
  bufEnd={controller.bufEnd}
  seekPreview={controller.seekPreview}
  chapters={chapters}
  tileAt={storyboard.tileAt}
  focused={nav.zone === 'progress'}
  elapsed={fmtTime(cur)} total={fmtTime(dur)} endsAt={endClock}
  onScrub={controller.scrubPreview}
  onScrubCommit={controller.scrubCommit}
/>`,
  guidelines: {
    do: [
      'Pass real `chapters` when the file has them: the segments are the navigation.',
      'Keep `seekPreview` separate from `cur` - the bar must show the target, not jump playback.',
    ],
    dont: [
      "Don't hide the bar when there are no chapters; one segment is the designed fallback.",
      "Don't compute the labels here - `elapsed`, `total` and `endsAt` arrive already formatted.",
    ],
  },
  matrix: false,
  viewport: 'tv',
  args: {
    cur: 2_940,
    dur: 9_840,
    bufEnd: 4_200,
    focused: true,
    endsAt: 'ends at 22:38',
    withChapters: true,
    scrubbing: false,
    withPreview: true,
  },
  controls: {
    cur: { min: 0, max: 9_840, step: 60 },
    dur: { min: 600, max: 14_400, step: 60 },
    bufEnd: { min: 0, max: 9_840, step: 60 },
  },
  render: (args) => <Scrubbable {...args} />,
  scenes: [
    {
      name: 'Scrubbing',
      docs: 'The playhead stays put while the preview runs ahead of it.',
      args: { scrubbing: true },
    },
    {
      name: 'No storyboard',
      docs: 'A file with no sprite sheet yet (ffmpeg is still building it): the bar works, without the preview.',
      args: { withPreview: false },
    },
    {
      name: 'No chapters',
      docs: 'One continuous segment: the graceful fallback for a file with no markers. Still scrubbable - the single segment is the whole runtime.',
      args: { withChapters: false },
    },
  ],
});
