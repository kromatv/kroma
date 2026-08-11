// Admin "Journaux" console: the server's recent log lines (core + module
// sidecars) from the in-memory ring over `/api/admin/logs`, with level/source/
// text filters and a follow-tail toggle. Polls; the ring is the source of
// truth so a page load shows history, not just what streams in afterwards.

import type { LogEntry, MessageKey } from '@kroma/core';
import { useT } from '@kroma/ui';
import { EmptyState, Field, SegmentedControl, Select, Surface, Switch } from '@kroma/ui/kit';
import { useEffect, useRef, useState } from 'react';
import { RealtimeBadge } from '#web/features/admin/realtime-badge';
import { PageHeader, usePoll } from '#web/features/admin/shell';
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
      <PageHeader.Root
        title={t('admin.logsTitle')}
        subtitle={t('admin.logsSub')}
        actions={<RealtimeBadge />}
      />
      <div className="mb-4 mt-2 flex flex-wrap items-center gap-3">
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
        <div className="ml-auto flex items-center gap-2 text-[13px] font-semibold text-muted">
          <span>{t('logs.follow')}</span>
          <Switch checked={follow} onChange={setFollow} label={t('logs.follow')} />
        </div>
      </div>
      {data === null ? <TableSkeleton rows={10} /> : null}
      {data && entries.length === 0 ? (
        <EmptyState.Root icon="terminal-2" title={t('logs.empty')} />
      ) : null}
      {entries.length > 0 ? (
        <Surface elevated pad="none" radius={16} border="border" overflow="hidden">
          <div ref={scroller} className="max-h-[70vh] overflow-y-auto px-4 py-3">
            {entries.map((e) => (
              <LogLine key={`${e.ts}-${e.source}-${e.message}`} entry={e} />
            ))}
          </div>
        </Surface>
      ) : null}
    </>
  );
}

const LEVEL_TONE: Record<string, string> = {
  error: 'bg-danger/15 text-danger-hover',
  warn: 'bg-accent/15 text-accent',
  info: 'bg-white/6 text-muted',
  debug: 'bg-white/4 text-dim',
  trace: 'bg-white/4 text-dim',
};

function LogLine({ entry }: Readonly<{ entry: LogEntry }>) {
  const time = new Date(entry.ts).toLocaleTimeString(undefined, { hour12: false });
  return (
    <div className="flex items-baseline gap-2.5 border-b border-white/4 py-1 font-mono text-[12px] leading-relaxed last:border-b-0">
      <span className="shrink-0 tabular-nums text-dim">{time}</span>
      <span
        className={`w-13 shrink-0 rounded px-1.5 text-center text-[10px] font-bold uppercase ${LEVEL_TONE[entry.level] ?? LEVEL_TONE.info}`}
      >
        {entry.level}
      </span>
      {entry.source !== 'core' ? (
        <span className="shrink-0 rounded bg-accent-soft px-1.5 text-[10px] font-semibold text-accent">
          {entry.source.replace(/^dev\.kroma\./, '')}
        </span>
      ) : null}
      <span className="min-w-0 wrap-break-word text-text/85">
        {entry.target ? <span className="text-dim">{entry.target}: </span> : null}
        {entry.message}
      </span>
    </div>
  );
}
