import type { SearchHit } from '@kromatv/client/media';
import { personInvolvement, posterColors, roleLabels } from '@kromatv/core';
import { useT } from '@kromatv/ui';
import { Box, Text, TopFade, useFocusNav } from '@kromatv/ui/kit';
import { useMemo } from 'react';
import { useClient, useNav, useParams } from '#tv/app/router';
import { type GridCard, PosterGrid } from '#tv/features/catalog/home/PosterGrid';
import { PersonHeader } from '#tv/features/catalog/person/PersonHeader';
import { usePersonCredits } from '#tv/features/catalog/person/use-person-credits';
import { usePersonDetail } from '#tv/features/catalog/person/usePersonDetail';
import { EMPTY } from '#tv/features/catalog/screenStyle';
import { useTitleMenu } from '#tv/features/catalog/TitleMenu';

const NO_CREDITS: SearchHit[] = [];

/** Everything one cast/crew person is credited in, as the server ranks it
 * (best-known first); the biography comes from the metadata provider and lands
 * a moment later. */
export function TvPerson() {
  const { name } = useParams('person');
  const credits = usePersonCredits(name);
  const client = useClient();
  const t = useT();
  const nav = useNav();
  const titleMenu = useTitleMenu(nav.back);
  useFocusNav({ onBack: titleMenu.onBack, resetKey: name });
  const hold = titleMenu.open;

  const { cards, involvement } = useMemo(() => {
    const hits = credits ?? NO_CREDITS;
    const cards = hits.flatMap((hit): GridCard[] => {
      if (hit.type === 'show') {
        const s = hit.show;
        return [
          {
            id: s.id,
            title: s.title,
            poster: (width: number) => client.media.artwork.showPosterFor(s, width),
            colors: posterColors(s.id),
            onClick: () => nav.go('show', { show: s }),
            onLongPress: () => hold({ kind: 'show', item: s }),
          },
        ];
      }
      if (hit.type !== 'movie') return [];
      const m = hit.item;
      return [
        {
          id: m.id,
          title: m.title,
          poster: (width: number) => client.media.artwork.posterFor(m, width),
          colors: posterColors(m.id),
          onClick: () => nav.go('movie', { item: m }),
          onLongPress: () => hold({ kind: 'movie', item: m }),
        },
      ];
    });
    const metas = hits.map((hit) => (hit.type === 'show' ? hit.show.metadata : hit.item.metadata));
    return { cards, involvement: personInvolvement(metas, name) };
  }, [credits, name, client, nav, hold]);

  const detail = usePersonDetail(name);
  // The provider's portrait is the better one; the credit's photo is the instant
  // one.
  const photo = client.media.artwork.resolve(
    detail?.profileUrl ?? involvement.profileUrl,
    PORTRAIT_W,
  );
  const roles = roleLabels(t, involvement);

  const grid = cards.length ? (
    <TopFade>
      <PosterGrid cards={cards} />
    </TopFade>
  ) : (
    <Box flex center px={64}>
      <Text style={EMPTY} color="textDim">
        {t('person.empty')}
      </Text>
    </Box>
  );

  return (
    <Box fill bg="bg" overflow="hidden">
      <PersonHeader
        name={detail?.name ?? name}
        roles={roles}
        photo={photo}
        titleCount={cards.length}
        detail={detail}
      />

      {credits === null ? null : grid}
      {titleMenu.menu}
    </Box>
  );
}

const PORTRAIT_W = 220;
