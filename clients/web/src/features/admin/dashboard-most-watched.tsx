import {
  type KromaClient,
  type MostWatchedColumn,
  type MostWatchedEntry,
  posterColors,
  type Translate,
} from '@kroma/core';
import { useT } from '@kroma/ui';
import {
  Box,
  Focusable,
  Grid,
  Img,
  RingScopeProvider,
  Row,
  Section,
  Surface,
  styles,
  Text,
  tintGradient,
} from '@kroma/ui/kit';
import { ScrollView } from 'react-native';
import { useAccountOptions } from '#web/features/admin/dashboard-accounts';
import {
  daysOf,
  EVERYONE,
  FilterSelect,
  kindLabelKey,
  useChoice,
  useRangeOptions,
  WATCH_RANGES,
} from '#web/features/admin/dashboard-filters';
import { Pill } from '#web/features/admin/pill';
import { usePoll } from '#web/features/admin/shell';
import { useAuth } from '#web/shared/lib/auth';
import { RouteLink } from '#web/shared/ui/route-link';

const POLL_MS = 60000;

const HEAD_HEIGHT = 128;
const HEAD_CROP = '50% 30%';
const THUMB_WIDTH = 36;
const LIST_HEIGHT = 360;

function posterOf(client: KromaClient, entry: MostWatchedEntry, width?: number): string | null {
  return client.resolveArt(entry.posterUrl, width);
}

function viewersLabel(t: Translate, count: number): string {
  return t(count === 1 ? 'admin.viewers_one' : 'admin.viewers_other', { count });
}

export function MostWatchedSection() {
  const t = useT();
  const { client } = useAuth();

  const range = useChoice(useRangeOptions(WATCH_RANGES), '30d');
  const account = useChoice(useAccountOptions(), EVERYONE);

  const { data } = usePoll(
    ['admin', 'mostWatched', range.value, account.value],
    () =>
      client.mostWatched({
        days: daysOf(range.value),
        user: account.value === EVERYONE ? undefined : account.value,
      }),
    POLL_MS,
  );

  return (
    <Section.Root mt={28}>
      <Section.Header>
        <Section.Title>{t('admin.mostWatched')}</Section.Title>
        <Section.Actions>
          <Row gap={10}>
            <FilterSelect label={t('admin.colUser')} choice={account} />
            <FilterSelect label={t('admin.mostWatched')} choice={range} />
          </Row>
        </Section.Actions>
      </Section.Header>
      <Grid columns={2} gap={16}>
        {(data?.columns ?? []).map((column) => (
          <KindColumn key={column.kind} column={column} />
        ))}
      </Grid>
    </Section.Root>
  );
}

function KindColumn({ column }: Readonly<{ column: MostWatchedColumn }>) {
  const t = useT();
  const { client } = useAuth();
  const [top] = column.entries;
  return (
    <Surface elevated pad="none" radius="xl" border="border" overflow="hidden">
      <Box h={HEAD_HEIGHT} bg="surface2">
        <Img
          src={top ? posterOf(client, top) : null}
          background={tintGradient(posterColors(column.kind))}
          position={HEAD_CROP}
          fill
        />
        <Box absolute left={14} bottom={12}>
          <Pill ink="text" bg="overlay" variant="overline">
            {t(kindLabelKey(column.kind))}
          </Pill>
        </Box>
      </Box>
      {column.entries.length === 0 ? (
        <Text variant="meta" color="textDim" px={16} py={18}>
          {t('admin.mostWatchedEmpty')}
        </Text>
      ) : (
        <RingScopeProvider value="focusInset">
          <ScrollView style={s.list}>
            {column.entries.map((entry) => (
              <EntryRow key={entry.itemId} entry={entry} />
            ))}
          </ScrollView>
        </RingScopeProvider>
      )}
    </Surface>
  );
}

function EntryRow({ entry }: Readonly<{ entry: MostWatchedEntry }>) {
  const t = useT();
  const { client } = useAuth();
  return (
    <Focusable style={s.entry} label={entry.title} asChild>
      <RouteLink to="/admin/history" search={{ item: entry.itemId }}>
        <Box w={THUMB_WIDTH} aspect={2 / 3} radius="sm" overflow="hidden" shrink={0}>
          <Img
            src={posterOf(client, entry, THUMB_WIDTH)}
            background={tintGradient(posterColors(entry.title))}
            fill
          />
        </Box>
        <Box flex minW={0}>
          <Text variant="label" lines={1}>
            {entry.title}
          </Text>
          <Text variant="meta" color="textDim" lines={1}>
            {`${t('admin.plays', { count: entry.plays })} · ${viewersLabel(t, entry.viewers)}`}
          </Text>
        </Box>
      </RouteLink>
    </Focusable>
  );
}

const s = styles({
  entry: { row: true, align: 'center', gap: 12, px: 14, py: 10 },
  list: { maxH: LIST_HEIGHT },
});
