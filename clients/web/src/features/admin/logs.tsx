// Admin "Journaux" console: the server's recent log lines (core + module
// sidecars) from the in-memory ring over `/api/admin/logs`, with level/source/
// text filters and a follow-tail toggle. Polls; the ring is the source of
// truth so a page load shows history, not just what streams in afterwards.

import type { MessageKey } from '@kroma/core';
import { useT } from '@kroma/ui';
import {
  EmptyState,
  Field,
  Row,
  SegmentGroup,
  Select,
  Spacer,
  Surface,
  Switch,
  Text,
} from '@kroma/ui/kit';
import { useEffect, useState } from 'react';
import { LogLines } from '#web/features/admin/log-lines';
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

/** The console. `source` is `core`, a module id, or `all` for every source; the
 * route holds it in the URL so a filtered console can be linked to. */
export function LogsPage({
  source,
  onSourceChange,
}: Readonly<{ source: string; onSourceChange: (source: string) => void }>) {
  const t = useT();
  const { client } = useAuth();
  const [level, setLevel] = useState<LevelFilter>('all');
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

  const entries = data?.entries ?? [];
  const known = data?.sources ?? [];
  const missing = source !== 'all' && !known.includes(source) ? [source] : [];
  const sources = ['all', ...known, ...missing];
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
        <SegmentGroup.Root value={level} onValueChange={setLevel}>
          {LEVELS.map((l) => (
            <SegmentGroup.Item key={l.value} value={l.value}>
              <SegmentGroup.Label>{t(l.labelKey)}</SegmentGroup.Label>
            </SegmentGroup.Item>
          ))}
        </SegmentGroup.Root>
        <Select.Root label={t('logs.allSources')} value={source} onValueChange={onSourceChange}>
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
          <LogLines entries={entries} maxHeight="70vh" follow={follow} />
        </Surface>
      ) : null}
    </>
  );
}
