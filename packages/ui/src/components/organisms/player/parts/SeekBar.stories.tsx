import { formatTimecode } from '@kroma/core';
import { story } from '@kroma/workbench/story';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Box } from '#ui/components/atoms/box';
import { stillArt } from '#ui/lib/sample-art';
import { currentChapter } from '../lib/chapters';
import { fakeTileAt } from '../player.fixture';
import type { Chapter } from '../types';
import { SeekBar } from './SeekBar';

/** A film with a real shape: cold open, three acts, credits. `kind` is what earns
 *  the intro and credits segments their own colour. */
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
  /** Show a pending scrub that is not where playback is, without touching it. */
  scrubbing: boolean;
  withPreview: boolean;
}

/**
 * The bar wired to state, which is the only way to show what it does: this
 * component IS a gesture, and a story that hands it `onScrub={() => {}}` shows a
 * picture of one. Press or drag the track and the playhead follows the cursor;
 * release and the seek commits, the way <Player> commits it to the media element.
 */
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
  // The `cur` control is the other way to seek, so it still drives the bar.
  useEffect(() => setCur(curArg), [curArg]);

  // The pending position lives in a ref as well as in state: the handlers stay
  // identity-stable, so the component's PanResponder is not rebuilt mid-drag.
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
  // `scrubbing` is the state a drag passes through, held still for the scene.
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
        // A synthesized sprite-sheet tile per bucket of the film: the preview is
        // the point of the component, so the story has to have one.
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
  group: 'Media',
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
  // The labels are not controls: `elapsed`, `chapterLabel` and `total` are
  // derived from the position exactly as <Player> derives them, so dragging the
  // bar moves the clock and the chapter name with it. Faking them as text would
  // let the story show 49:00 next to a playhead at 20:00.
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
