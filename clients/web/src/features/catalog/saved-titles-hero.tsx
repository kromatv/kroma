import { useT } from '@kroma/ui';
import { useMemo } from 'react';
import { BrowseHero } from '#web/features/catalog/browse-hero';
import {
  featuredSavedTitle,
  SAVED_TAB_COPY,
  type SavedTab,
  type SavedTitle,
} from '#web/features/catalog/saved-titles';

export interface SavedTitlesHeroProps {
  tab: SavedTab;
  titles: readonly SavedTitle[];
}

export function SavedTitlesHero({ tab, titles }: Readonly<SavedTitlesHeroProps>) {
  const t = useT();
  const featured = useMemo(() => featuredSavedTitle(titles), [titles]);
  return (
    <BrowseHero
      eyebrow={t('nav.myList')}
      heading={t(SAVED_TAB_COPY[tab].label)}
      countText={titles.length > 0 ? t('content.titleCount', { count: titles.length }) : undefined}
      backdrop={featured?.backdrop}
      creditTitle={featured?.title}
    />
  );
}
