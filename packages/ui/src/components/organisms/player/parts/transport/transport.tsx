import { formatTimecode as fmtTime } from '@kroma/core';
import { useMemo } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { styles } from '#ui/core';
import { gradient } from '#ui/lib/css';
import { useLocale, useT } from '#ui/services/i18n';
import type { StoryboardTile } from '#ui/services/storyboard';
import type { usePlayerNav } from '../../hooks/use-player-nav';
import { currentChapter, normalizeChapters } from '../../lib/chapters';
import { endsAtClock } from '../../lib/fmt';
import { type ChromeMetrics, GUTTER, scaler } from '../../lib/metrics';
import type { Chapter, PlayerController } from '../../types';
import { ControlCluster } from '../control-cluster';
import { SeekBar } from '../seek-bar';

interface TransportProps {
  controller: PlayerController;
  chapters?: Chapter[];
  tileAt: (sec: number) => StoryboardTile | null;
  metrics: ChromeMetrics;
  nav: ReturnType<typeof usePlayerNav>;
  chromeShown: boolean;
  /** The padding the up-next peek claims under the controls, in real pixels: it
   *  is the sheet's own height and is never scaled. */
  bottomInset: number;
  onLayout: (event: LayoutChangeEvent) => void;
}

function Transport({
  controller: c,
  chapters: rawChapters,
  tileAt,
  metrics,
  nav,
  chromeShown,
  bottomInset,
  onLayout,
}: Readonly<TransportProps>) {
  const t = useT();
  const locale = useLocale();
  const px = scaler(metrics.scale);

  const chapters = useMemo(
    () => normalizeChapters(rawChapters, c.dur * 1000),
    [rawChapters, c.dur],
  );
  const shown = c.seekPreview ?? c.cur;
  const curChapter = currentChapter(chapters, shown * 1000);
  const endsAt = c.dur ? endsAtClock(Math.max(0, c.dur - c.cur) * 1000, locale) : '';

  return (
    /* The gradient stays anchored to the screen bottom and the controls are
      lifted above the up-next peek with padding instead, so the peek overlays
      its dark foot rather than the gradient ending in a hard band. */
    <Box
      absolute
      left={0}
      right={0}
      bottom={0}
      z={15}
      px={px(GUTTER)}
      pt={px(80)}
      // Not scaled: it is the peek's own height, from the sheet that draws it.
      pb={bottomInset}
      opacity={chromeShown ? 1 : 0}
      style={[chromeShown ? s.chromeLive : s.inert, BOTTOM_SCRIM]}
    >
      {/* Measured so the skip-intro pill can sit clear of it; the layout is
        kept while the chrome fades (opacity, not display). */}
      <Box onLayout={onLayout}>
        <SeekBar
          cur={c.cur}
          dur={c.dur}
          bufEnd={c.bufEnd}
          seekPreview={c.seekPreview}
          chapters={chapters}
          tileAt={tileAt}
          focused={nav.zone === 'progress'}
          elapsed={fmtTime(shown)}
          chapterLabel={curChapter?.title || undefined}
          total={fmtTime(c.dur)}
          endsAt={endsAt ? t('content.endsAtShort', { time: endsAt }) : ''}
          scale={metrics.scale}
          onScrub={c.scrubPreview}
          onScrubCommit={c.scrubCommit}
        />
        <ControlCluster
          focused={nav.focusedControl}
          playing={c.playing}
          muted={c.muted}
          volume={c.volume}
          pipActive={c.pipActive}
          fullscreen={c.fullscreen}
          metrics={metrics}
          onActivate={nav.activate}
          onFocus={nav.focusControl}
          onVolume={c.setVolume}
        />
      </Box>
    </Box>
  );
}

const BOTTOM_SCRIM = gradient('linear-gradient(0deg, rgba(0,0,0,0.82), transparent)');

const s = styles({
  inert: { pointerEvents: 'none' },
  chromeLive: { pointerEvents: 'box-none' },
});

export { Transport };
