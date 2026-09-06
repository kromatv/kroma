// The missing-episode rows inside a "Manquants" group card: the whole row is
// the selection control, and long lists collapse behind a "show more" toggle so
// one gappy series can't swallow the page.

import type { CalendarEntry } from '@kroma/client/requests';
import { episodeTag, relativeAirDate, sentenceCase } from '@kroma/core';
import { useLocale, useT } from '@kroma/ui';
import {
  Box,
  Button,
  CheckboxFace,
  classes,
  Divider,
  Focusable,
  Icon,
  IconButton,
  RingScopeProvider,
  Row,
  Spinner,
  styles,
  Text,
} from '@kroma/ui/kit';
import { useState } from 'react';
import { epKey } from '#web/features/requests/missing-model';

// Episode lists longer than this collapse behind a "show more" toggle.
const COLLAPSE_OVER = 12;
// How many rows a collapsed list keeps visible.
const COLLAPSED_ROWS = 10;

const s = styles({
  list: { m: 0, p: 0, listStyleType: 'none' },
  listItem: { display: 'block' },
  italic: { fontStyle: 'italic' },
  episode: { row: true, align: 'center', gap: 16, flex: true, minW: 0, py: 10, pl: 14 },
  tag: { w: 62, shrink: 0, fontWeight: '700', fontVariant: ['tabular-nums'] },
});

export function EpisodeList({
  entries,
  canAct,
  busyKeys,
  doneKeys,
  selected,
  onToggleRow,
  onSearch,
}: Readonly<{
  entries: CalendarEntry[];
  canAct: boolean;
  busyKeys: Set<string>;
  doneKeys: Set<string>;
  selected: Set<string>;
  onToggleRow: (key: string) => void;
  onSearch: (items: CalendarEntry[]) => void;
}>) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  if (entries.length === 0) return null;

  const collapsed = !expanded && entries.length > COLLAPSE_OVER;
  const visible = collapsed ? entries.slice(0, COLLAPSED_ROWS) : entries;
  return (
    <RingScopeProvider value="focusInset">
      <ul className={classes(s.list)}>
        {visible.map((e, index) => (
          <EpisodeRow
            key={epKey(e)}
            entry={e}
            ruled={index > 0}
            canAct={canAct}
            busy={busyKeys.has(epKey(e))}
            done={doneKeys.has(epKey(e))}
            picked={selected.has(epKey(e))}
            onToggle={() => onToggleRow(epKey(e))}
            onSearch={() => onSearch([e])}
          />
        ))}
        {entries.length > COLLAPSE_OVER ? (
          <li className={classes(s.listItem)}>
            <Divider color="tint/4" />
            <Box px={6} py={6} self="flex-start">
              <Button
                variant="ghost"
                size="sm"
                iconRight={collapsed ? 'chevron-down' : 'chevron-up'}
                label={
                  collapsed
                    ? t('requests.showMore', { count: entries.length - COLLAPSED_ROWS })
                    : t('requests.showLess')
                }
                onPress={() => setExpanded((v) => !v)}
              />
            </Box>
          </li>
        ) : null}
      </ul>
    </RingScopeProvider>
  );
}

function EpisodeRow({
  entry,
  ruled,
  canAct,
  busy,
  done,
  picked,
  onToggle,
  onSearch,
}: Readonly<{
  entry: CalendarEntry;
  ruled: boolean;
  canAct: boolean;
  busy: boolean;
  done: boolean;
  picked: boolean;
  onToggle: () => void;
  onSearch: () => void;
}>) {
  const cells = <EpisodeCells entry={entry} />;
  const rule = ruled ? <Divider color="tint/4" /> : null;

  if (!canAct) {
    return (
      <li className={classes(s.listItem)}>
        {rule}
        <Row gap={16} py={10} pl={50} pr={14}>
          {cells}
        </Row>
      </li>
    );
  }
  return (
    <li className={classes(s.listItem)}>
      {rule}
      <Row minW={0}>
        <Focusable
          role="checkbox"
          checked={picked}
          onPress={onToggle}
          label={episodeTag(entry)}
          style={s.episode}
        >
          <CheckboxFace checked={picked} />
          {cells}
        </Focusable>
        <Box px={8} justify="center">
          <RowAction busy={busy} done={done} onSearch={onSearch} />
        </Box>
      </Row>
    </li>
  );
}

function EpisodeCells({ entry }: Readonly<{ entry: CalendarEntry }>) {
  const t = useT();
  const locale = useLocale();
  const rel = relativeAirDate(entry.airDate, locale);
  return (
    <>
      <Text variant="meta" font="mono" color="accent" style={s.tag}>
        {episodeTag(entry)}
      </Text>
      {rel ? (
        <Text variant="meta" color="textDim" lines={1} flex minW={0}>
          {sentenceCase(rel, locale)}
        </Text>
      ) : (
        <Text variant="meta" color="white/35" lines={1} flex minW={0} style={s.italic}>
          {t('requests.noDate')}
        </Text>
      )}
    </>
  );
}

function RowAction({
  busy,
  done,
  onSearch,
}: Readonly<{ busy: boolean; done: boolean; onSearch: () => void }>) {
  const t = useT();
  if (done) {
    return (
      <IconButton variant="ghost" control="sm" label={t('requests.searchStarted')} disabled>
        <Icon name="check" size={16} color="success" />
      </IconButton>
    );
  }
  return (
    <IconButton
      variant="ghost"
      control="sm"
      ring="focusEdge"
      icon="search"
      label={t('requests.searchTitle')}
      onPress={onSearch}
      disabled={busy}
    >
      {busy ? <Spinner size={15} /> : null}
    </IconButton>
  );
}
