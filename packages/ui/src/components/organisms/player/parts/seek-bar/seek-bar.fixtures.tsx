import { formatTimecode } from '@kroma/core';

import { useCallback, useEffect, useRef, useState } from 'react';

import { Box } from '#ui/components/atoms/box';

import { Ground } from '#ui/components/atoms/ground';

import { currentChapter } from '#ui/components/organisms/player/lib/chapters';

import { CHAPTERS, fakeTileAt } from '#ui/components/organisms/player/player.fixture';

import { stillArt } from '#ui/lib/sample-art';

import { SeekBar } from './seek-bar';

export interface ScrubbableProps {
  cur: number;
  dur: number;
  bufEnd: number;
  focused: boolean;
  endsAt: string;
  withChapters: boolean;
  scrubbing: boolean;
  withPreview: boolean;
}

export function Scrubbable({
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
    <Ground tone="dark" flex>
      <Box flex justify="flex-end" bg="bg" px={34} pb={60}>
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
    </Ground>
  );
}
