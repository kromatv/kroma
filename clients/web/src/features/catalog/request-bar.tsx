// The show page's request bar: what the current episode selection would ask
// for, plus the two shortcuts that skip the ticking. It sticks to the bottom of
// the viewport while anything is picked, so the choice stays reachable however
// far down the season the viewer has scrolled.

import { useT } from '@kroma/ui';
import { Button, IconButton, Row, Surface, Text } from '@kroma/ui/kit';
import type { CSSProperties } from 'react';

const STICKY: CSSProperties = {
  position: 'sticky',
  bottom: 16,
  zIndex: 3,
  paddingLeft: 'var(--gutter-web)',
  paddingRight: 'var(--gutter-web)',
  marginTop: 20,
};

export function RequestBar({
  count,
  season,
  seasonPickable,
  allPickable,
  busy,
  onRequestSelected,
  onRequestSeason,
  onRequestAll,
  onClear,
}: Readonly<{
  count: number;
  season: number;
  /** This season still has something to ask for (it is not fully owned or
   *  already requested). */
  seasonPickable: boolean;
  /** Some season of the show still has something to ask for. */
  allPickable: boolean;
  busy: boolean;
  onRequestSelected: () => void;
  onRequestSeason: () => void;
  onRequestAll: () => void;
  onClear: () => void;
}>) {
  const t = useT();
  if (count === 0 && !seasonPickable && !allPickable) return null;
  return (
    <div style={STICKY}>
      <Surface elevated radius="2xl" pad="md">
        <Row wrap between gap={12}>
          <Text variant="meta" color={count > 0 ? 'text' : 'textDim'}>
            {count > 0 ? t('requests.selectedEpisodes', { count }) : t('requests.pickEpisodesHint')}
          </Text>
          <Row wrap gap={8}>
            {count > 0 ? (
              <>
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
              </>
            ) : null}
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
        </Row>
      </Surface>
    </div>
  );
}
