import { useT } from '@kromatv/ui';
import { Button, classes, IconButton, Row, Surface, styles, Text } from '@kromatv/ui/kit';

const s = styles({
  sticky: {
    position: 'sticky',
    bottom: 16,
    zIndex: 3,
    paddingLeft: 'var(--gutter-web)',
    paddingRight: 'var(--gutter-web)',
    mt: 20,
  },
});

export function RequestBar({
  count,
  busy,
  onRequestSelected,
  onClear,
}: Readonly<{
  count: number;
  busy: boolean;
  onRequestSelected: () => void;
  onClear: () => void;
}>) {
  const t = useT();
  if (count === 0) return null;
  return (
    <div className={classes(s.sticky)}>
      <Surface elevated radius="xl" pad="md">
        <Row wrap between gap={12}>
          <Text variant="meta">{t('requests.selectedEpisodes', { count })}</Text>
          <Row wrap gap={8}>
            <Button
              size="sm"
              icon="plus"
              label={t('requests.askForSelected', { count })}
              onPress={onRequestSelected}
              loading={busy}
            />
            <IconButton
              variant="ghost"
              control="sm"
              icon="x"
              label={t('common.clear')}
              onPress={onClear}
            />
          </Row>
        </Row>
      </Surface>
    </div>
  );
}

export function SeasonAsk({
  season,
  seasonPickable,
  allPickable,
  busy,
  onRequestSeason,
  onRequestAll,
}: Readonly<{
  season: number;
  seasonPickable: boolean;
  allPickable: boolean;
  busy: boolean;
  onRequestSeason: () => void;
  onRequestAll: () => void;
}>) {
  const t = useT();
  if (!seasonPickable && !allPickable) return null;
  return (
    <Row wrap gap={8}>
      {seasonPickable ? (
        <Button
          variant="outline"
          size="sm"
          label={t('requests.askForSeason', { number: season })}
          onPress={onRequestSeason}
          disabled={busy}
        />
      ) : null}
      {allPickable ? (
        <Button
          variant="ghost"
          size="sm"
          label={t('requests.askForAllSeasons')}
          onPress={onRequestAll}
          disabled={busy}
        />
      ) : null}
    </Row>
  );
}
