// The log viewport shared by the "Journaux" console and the module page's
// recent-output panel: the scrolling pane, the day marks that break it up and
// the per-line grid. The filters and the follow toggle stay with the console.

import type { LogEntry } from '@kroma/core';
import { TABULAR } from '@kroma/module-sdk';
import { useLocaleDefault } from '@kroma/ui';
import { Box, type ColorValue, Row, Text } from '@kroma/ui/kit';
import { type CSSProperties, Fragment, useEffect, useRef } from 'react';

// A capped height, a single-axis scroll and a CSS grid have no React Native
// spelling, so the viewport and its rows stay real elements.
const LINES: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'max-content max-content minmax(0, 1fr)',
  alignItems: 'baseline',
  columnGap: 10,
  rowGap: 8,
  padding: '12px 16px',
};

const FULL_ROW: CSSProperties = { gridColumn: '1 / -1' };

/** Draws `entries` newest-last in a pane that scrolls past `maxHeight` (any CSS
 * length). With `follow`, every change re-pins the pane to the newest line. */
export function LogLines({
  entries,
  maxHeight,
  follow = false,
}: Readonly<{ entries: readonly LogEntry[]; maxHeight: number | string; follow?: boolean }>) {
  const scroller = useRef<HTMLDivElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on new lines
  useEffect(() => {
    if (follow && scroller.current) {
      scroller.current.scrollTop = scroller.current.scrollHeight;
    }
  }, [entries, follow]);

  return (
    <div ref={scroller} style={{ maxHeight, overflowY: 'auto' }}>
      <div style={LINES}>
        {entries.map((e, i) => (
          <Fragment key={e.seq}>
            {sameDay(entries[i - 1]?.ts, e.ts) ? null : (
              <div style={FULL_ROW}>
                <DayMark ts={e.ts} />
              </div>
            )}
            <LogLine entry={e} />
          </Fragment>
        ))}
      </div>
    </div>
  );
}

const LEVEL_TONE: Record<string, { bg: ColorValue; ink: ColorValue }> = {
  error: { bg: 'danger/15', ink: 'dangerHover' },
  warn: { bg: 'accentWash/15', ink: 'accentText' },
  info: { bg: 'tint/6', ink: 'textMuted' },
  debug: { bg: 'tint/4', ink: 'textDim' },
  trace: { bg: 'tint/4', ink: 'textDim' },
};

const INFO_TONE = { bg: 'tint/6', ink: 'textMuted' } as const;

function sameDay(a: number | undefined, b: number): boolean {
  if (!a) return false;
  return new Date(a).toDateString() === new Date(b).toDateString();
}

// Every line carries a clock, so the date belongs where it changes rather than
// on all of them: a log read top to bottom is otherwise a column of times that
// silently crosses midnight.
function DayMark({ ts }: Readonly<{ ts: number }>) {
  const locale = useLocaleDefault();
  return (
    <Row align="center" gap={10} pt={10} pb={6}>
      <Text variant="overline" color="textDim" shrink={0}>
        {new Date(ts).toLocaleDateString(locale, {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        })}
      </Text>
      <Box flex minH={0} h={1} bg="tint/8" />
    </Row>
  );
}

function LogLine({ entry }: Readonly<{ entry: LogEntry }>) {
  const locale = useLocaleDefault();
  const time = new Date(entry.ts).toLocaleTimeString(locale, { hour12: false });
  const tone = LEVEL_TONE[entry.level] ?? INFO_TONE;
  return (
    <>
      <Text variant="meta" font="mono" color="textDim" style={TABULAR}>
        {time}
      </Text>
      <Box radius={4} bg={tone.bg} px={6}>
        <Text variant="overline" color={tone.ink} textAlign="center" lines={1}>
          {entry.level}
        </Text>
      </Box>
      <Row align="baseline" gap={8}>
        {entry.source === 'core' ? null : (
          <Box shrink={0} radius={4} bg="accentSoft" px={6}>
            <Text variant="overline" color="accentText" lines={1}>
              {entry.source.replace(/^dev\.kroma\./, '')}
            </Text>
          </Box>
        )}
        <Text variant="meta" font="mono" color="textMuted" flex={1} minW={0}>
          {entry.target ? <Text color="textDim">{entry.target}: </Text> : null}
          {entry.message}
        </Text>
      </Row>
    </>
  );
}
