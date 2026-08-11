import { useLocale, useT } from '@kroma/ui';
import {
  Box,
  Button,
  CheckboxFace,
  Divider,
  Drawer,
  IconButton,
  ListRow,
  Row,
  Text,
} from '@kroma/ui/kit';
import { useState } from 'react';
import type { ViewStyle } from 'react-native';
import { RequestStatusChip } from '#web/features/requests/request-status-chip';
import type { TitleSeason } from '#web/shared/lib/titleView';

export function SeasonPicker({
  seasons,
  title,
  busy,
  initial,
  onClose,
  onRequest,
}: Readonly<{
  seasons: TitleSeason[];
  title: string;
  busy: boolean;
  initial?: number[];
  onClose: () => void;
  onRequest: (seasons: number[] | null) => void;
}>) {
  const t = useT();
  const openSeasons = seasons.filter((s) => !s.available && !s.requested);
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(initial ?? openSeasons.map((s) => s.number)),
  );

  const toggle = (season: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(season)) next.delete(season);
      else next.add(season);
      return next;
    });
  };
  const allOpen = openSeasons.length > 0 && openSeasons.every((s) => selected.has(s.number));
  const toggleAll = () =>
    setSelected(allOpen ? new Set() : new Set(openSeasons.map((s) => s.number)));

  const submit = () => {
    const all = seasons.length === selected.size && openSeasons.length === seasons.length;
    onRequest(all ? null : Array.from(selected).sort((a, b) => a - b));
  };

  return (
    <Drawer open title={t('discover.requestSeasons')} onClose={onClose} width={420} fullBelow={640}>
      <Row shrink={0} between gap={12} px={24} py={20}>
        <Box shrink={1}>
          <Text variant="overline" color="text/40">
            {t('discover.requestSeasons')}
          </Text>
          <h2 style={HEADING}>
            <Text variant="title" mt={4}>
              {title}
            </Text>
          </h2>
        </Box>
        <IconButton variant="ghost" icon="x" label={t('common.close')} onPress={onClose} />
      </Row>
      <Divider />

      <Box flex px={24} py={16} style={SCROLL}>
        <ListRow.Group size="sm">
          {openSeasons.length > 1 ? (
            <ListRow.Root
              size="sm"
              role="checkbox"
              checked={allOpen}
              chevron={false}
              onPress={toggleAll}
            >
              <ListRow.Leading>
                <CheckboxFace checked={allOpen} />
              </ListRow.Leading>
              <ListRow.Label>{t('discover.allSeasons')}</ListRow.Label>
            </ListRow.Root>
          ) : null}
          {seasons.map((s) => (
            <SeasonRow
              key={s.number}
              s={s}
              checked={selected.has(s.number)}
              onToggle={() => toggle(s.number)}
            />
          ))}
        </ListRow.Group>
      </Box>

      <Divider />
      <Box shrink={0} px={24} py={18}>
        <Button
          block
          label={t('discover.requestN', { n: String(selected.size) })}
          onPress={submit}
          loading={busy}
          disabled={selected.size === 0}
        />
      </Box>
    </Drawer>
  );
}

function SeasonRow({
  s,
  checked,
  onToggle,
}: Readonly<{ s: TitleSeason; checked: boolean; onToggle: () => void }>) {
  const t = useT();
  const locale = useLocale();
  const locked = s.available || s.requested;
  const today = new Date().toISOString().slice(0, 10);
  const upcoming =
    s.airDate && s.airDate > today
      ? new Date(`${s.airDate}T00:00:00`).toLocaleDateString(locale)
      : null;
  return (
    <ListRow.Root
      size="sm"
      role="checkbox"
      checked={checked}
      disabled={locked}
      chevron={false}
      onPress={onToggle}
      style={locked ? LOCKED : undefined}
    >
      <ListRow.Leading>
        {locked ? (
          <RequestStatusChip status={s.available ? 'available' : 'pending'} size="card" />
        ) : (
          <CheckboxFace checked={checked} />
        )}
      </ListRow.Leading>
      <ListRow.Label>{s.name ?? t('discover.seasonN', { n: String(s.number) })}</ListRow.Label>
      <ListRow.Hint>{t('discover.episodesN', { n: String(s.episodeCount) })}</ListRow.Hint>
      {upcoming ? (
        <Text variant="meta" color="accent" mt={2}>
          {t('requests.availableDate', { date: upcoming })}
        </Text>
      ) : null}
    </ListRow.Root>
  );
}

const HEADING = { margin: 0 } as const;

const LOCKED = { opacity: 0.7 } as const;

const SCROLL = { overflowY: 'auto' } as unknown as ViewStyle;
