import type { CalendarEntry } from '@kromatv/client/requests';
import { datedDayLabel, episodeTag } from '@kromatv/core';
import { useLocale, useT } from '@kromatv/ui';
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
} from '@kromatv/ui/kit';
import { useState } from 'react';
import { epKey } from '#web/features/requests/missing-model';
import type { GroupAction } from '#web/features/requests/use-missing-actions';

const COLLAPSE_OVER = 12;
const COLLAPSED_ROWS = 10;

const ROW_ACTION = {
  search: { icon: 'search', key: 'requests.searchUnit', started: 'requests.searchStarted' },
  follow: { icon: 'plus', key: 'requests.followUnit', started: 'monitoring.action' },
  request: { icon: 'plus', key: 'requests.askUnit', started: 'requests.asked' },
} as const;

const s = styles({
  list: { m: 0, p: 0, listStyleType: 'none' },
  listItem: { display: 'block' },
  italic: { fontStyle: 'italic' },
  episode: { row: true, align: 'center', gap: 16, flex: true, minW: 0, py: 10, pl: 14 },
  tag: { w: 62, shrink: 0, fontVariant: ['tabular-nums'] },
});

function unitLabel(title: string, entry: CalendarEntry): string {
  return [title, episodeTag(entry), entry.episodeTitle].filter(Boolean).join(' · ');
}

export function EpisodeList({
  entries,
  title,
  action,
  busyKeys,
  startedKeys,
  selected,
  onToggleRow,
  onRun,
}: Readonly<{
  entries: CalendarEntry[];
  title: string;
  action: GroupAction;
  busyKeys: ReadonlySet<string>;
  startedKeys: ReadonlySet<string>;
  selected: ReadonlySet<string>;
  onToggleRow: (key: string) => void;
  onRun: (items: CalendarEntry[]) => void;
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
            name={unitLabel(title, e)}
            ruled={index > 0}
            action={action}
            busy={busyKeys.has(epKey(e))}
            started={startedKeys.has(epKey(e))}
            picked={selected.has(epKey(e))}
            onToggle={() => onToggleRow(epKey(e))}
            onRun={() => onRun([e])}
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
  name,
  ruled,
  action,
  busy,
  started,
  picked,
  onToggle,
  onRun,
}: Readonly<{
  entry: CalendarEntry;
  name: string;
  ruled: boolean;
  action: GroupAction;
  busy: boolean;
  started: boolean;
  picked: boolean;
  onToggle: () => void;
  onRun: () => void;
}>) {
  const t = useT();
  const cells = <EpisodeCells entry={entry} />;
  const rule = ruled ? <Divider color="tint/4" /> : null;

  if (action === 'none') {
    return (
      <li className={classes(s.listItem)}>
        {rule}
        <Row gap={16} py={10} px={14}>
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
          label={t('requests.selectUnit', { item: name })}
          style={s.episode}
        >
          <CheckboxFace checked={picked} />
          {cells}
        </Focusable>
        <Box px={8} justify="center">
          <RowAction action={action} name={name} busy={busy} started={started} onRun={onRun} />
        </Box>
      </Row>
    </li>
  );
}

function EpisodeCells({ entry }: Readonly<{ entry: CalendarEntry }>) {
  const t = useT();
  const locale = useLocale();
  return (
    <>
      <Text variant="meta" font="mono" color="textDim" style={s.tag}>
        {episodeTag(entry)}
      </Text>
      {entry.episodeTitle ? (
        <Text variant="meta" lines={1} flex minW={0}>
          {entry.episodeTitle}
        </Text>
      ) : (
        <Box flex minW={0} />
      )}
      {entry.airDate ? (
        <Text variant="meta" color="textDim" lines={1} shrink={0}>
          {datedDayLabel(entry.airDate, locale)}
        </Text>
      ) : (
        <Text variant="meta" color="textMuted" lines={1} shrink={0} style={s.italic}>
          {t('requests.noDate')}
        </Text>
      )}
    </>
  );
}

function RowAction({
  action,
  name,
  busy,
  started,
  onRun,
}: Readonly<{
  action: Exclude<GroupAction, 'none'>;
  name: string;
  busy: boolean;
  started: boolean;
  onRun: () => void;
}>) {
  const t = useT();
  const { icon, key, started: startedKey } = ROW_ACTION[action];
  if (started) {
    return (
      <IconButton variant="ghost" control="sm" label={t(startedKey)} disabled>
        <Icon name="check" size={16} color="success" />
      </IconButton>
    );
  }
  return (
    <IconButton
      variant="ghost"
      control="sm"
      ring="focusEdge"
      icon={icon}
      label={t(key, { item: name })}
      onPress={onRun}
      disabled={busy}
    >
      {busy ? <Spinner size={15} /> : null}
    </IconButton>
  );
}
