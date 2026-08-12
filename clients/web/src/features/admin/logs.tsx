// Admin "Journaux" console: the server's recent log lines (core + module
// sidecars) from the in-memory ring over `/api/admin/logs`, with level/source/
// text filters and a follow-tail toggle. Polls; the ring is the source of
// truth so a page load shows history, not just what streams in afterwards.

import type { LogEntry, MessageKey } from '@kroma/core';
import { useT } from '@kroma/ui';
import {
  Box,
  type ColorValue,
  EmptyState,
  Field,
  Row,
  SegmentedControl,
  Select,
  Spacer,
  Surface,
  Switch,
  Text,
} from '@kroma/ui/kit';
import { type CSSProperties, useEffect, useRef, useState } from 'react';

// A viewport-relative height and a single-axis scroll have no React Native
// spelling, so the log viewport stays a real element.
const VIEWPORT: CSSProperties = { maxHeight: '70vh', overflowY: 'auto' };

import { RealtimeBadge } from '#web/features/admin/realtime-badge';
import { PageHeader, usePoll } from '#web/features/admin/shell';
import { TABULAR } from '#web/features/admin/table';
import { useAuth } from '#web/shared/lib/auth';
import { TableSkeleton } from '#web/shared/ui';

type LevelFilter = 'all' | 'info' | 'warn' | 'error';

const LEVELS: { value: LevelFilter; labelKey: MessageKey }[] = [
  { value: 'all', labelKey: 'logs.levelAll' },
  { value: 'info', labelKey: 'logs.levelInfo' },
  { value: 'warn', labelKey: 'logs.levelWarn' },
  { value: 'error', labelKey: 'logs.levelError' },
];

export function LogsPage() {
  const t = useT();
  const { client } = useAuth();
  const [level, setLevel] = useState<LevelFilter>('all');
  const [source, setSource] = useState('all');
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [follow, setFollow] = useState(true);

  // Debounce the search box so typing doesn't fire a request per keystroke.
  useEffect(() => {
    const id = setTimeout(() => setQ(qInput.trim()), 350);
    return () => clearTimeout(id);
  }, [qInput]);

  const { data } = usePoll(
    ['admin', 'logs', level, source, q],
    () =>
      client.adminLogs({
        level: level === 'all' ? undefined : level,
        source: source === 'all' ? undefined : source,
        q: q || undefined,
        limit: 1000,
      }),
    3000,
  );

  // Follow the tail: pin the viewport to the newest line on every refresh.
  const scroller = useRef<HTMLDivElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on new data
  useEffect(() => {
    if (follow && scroller.current) {
      scroller.current.scrollTop = scroller.current.scrollHeight;
    }
  }, [data, follow]);

  const entries = data?.entries ?? [];
  const sources = ['all', ...(data?.sources ?? [])];
  const sourceLabel = (s: string) => {
    if (s === 'all') return t('logs.allSources');
    return s === 'core' ? t('logs.sourceCore') : s;
  };

  return (
    <>
      <PageHeader.Root>
        <PageHeader.Title>{t('admin.logsTitle')}</PageHeader.Title>
        <PageHeader.Subtitle>{t('admin.logsSub')}</PageHeader.Subtitle>
        <PageHeader.Actions>
          <RealtimeBadge />
        </PageHeader.Actions>
      </PageHeader.Root>
      <Row wrap gap={12} mt={8} mb={16}>
        <SegmentedControl.Root
          value={level}
          options={LEVELS.map((l) => ({ value: l.value, label: t(l.labelKey) }))}
          onValueChange={setLevel}
        />
        <Select.Root label={t('logs.allSources')} value={source} onValueChange={setSource}>
          <Select.Trigger />
          {sources.map((s) => (
            <Select.Item key={s} value={s} label={sourceLabel(s)} />
          ))}
        </Select.Root>
        <Field.Root w={256} label={t('logs.searchPlaceholder')} hideLabel>
          <Field.Input
            type="search"
            icon="search"
            placeholder={t('logs.searchPlaceholder')}
            value={qInput}
            onValueChange={setQInput}
          />
        </Field.Root>
        <Spacer />
        <Row gap={8}>
          <Text variant="meta" color="textMuted">
            {t('logs.follow')}
          </Text>
          <Switch checked={follow} onCheckedChange={setFollow} label={t('logs.follow')} />
        </Row>
      </Row>
      {data === null ? <TableSkeleton rows={10} /> : null}
      {data && entries.length === 0 ? (
        <EmptyState.Root icon="terminal-2">
          <EmptyState.Title>{t('logs.empty')}</EmptyState.Title>
        </EmptyState.Root>
      ) : null}
      {entries.length > 0 ? (
        <Surface elevated pad="none" radius="xl" border="border" overflow="hidden">
          <div ref={scroller} style={VIEWPORT}>
            <Box px={16} py={12}>
              {entries.map((e, i) => (
                <Box key={`${e.ts}-${e.source}-${e.message}`}>
                  {sameDay(entries[i - 1]?.ts, e.ts) ? null : <DayMark ts={e.ts} />}
                  <LogLine entry={e} />
                </Box>
              ))}
            </Box>
          </div>
        </Surface>
      ) : null}
    </>
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
  return (
    <Row align="center" gap={10} pt={10} pb={6}>
      <Text variant="overline" color="textDim" shrink={0}>
        {new Date(ts).toLocaleDateString(undefined, {
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
  const time = new Date(entry.ts).toLocaleTimeString(undefined, { hour12: false });
  const tone = LEVEL_TONE[entry.level] ?? INFO_TONE;
  return (
    <Row align="baseline" gap={10} py={4}>
      <Text variant="meta" font="mono" color="textDim" shrink={0} style={TABULAR}>
        {time}
      </Text>
      <Box shrink={0} radius={4} bg={tone.bg} px={6}>
        <Text variant="overline" color={tone.ink} textAlign="center" lines={1}>
          {entry.level}
        </Text>
      </Box>
      {entry.source !== 'core' ? (
        <Box shrink={0} radius={4} bg="accentSoft" px={6}>
          <Text variant="overline" color="accentText">
            {entry.source.replace(/^dev\.kroma\./, '')}
          </Text>
        </Box>
      ) : null}
      <Text variant="meta" font="mono" color="textMuted" flex={1} minW={0}>
        {entry.target ? <Text color="textDim">{entry.target}: </Text> : null}
        {entry.message}
      </Text>
    </Row>
  );
}
