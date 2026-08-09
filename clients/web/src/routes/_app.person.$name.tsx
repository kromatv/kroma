import { personDisplayName, personInvolvement, posterColors, roleLabels } from '@kroma/core';
import { useT } from '@kroma/ui';
import { EmptyState } from '@kroma/ui/kit';

import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { type CatalogEntry, CatalogGrid } from '#web/features/catalog/cards';
import { initials } from '#web/features/catalog/detail';
import { PersonProfile } from '#web/features/catalog/person-profile';
import { imageUrl, isAuthed, kromaClient, toMovieView, toShowView } from '#web/shared/lib/api';
import { catalogQueries } from '#web/shared/lib/queries';
import { Image, PAGE_MAIN, PAGE_TITLE, PageSkeleton } from '#web/shared/ui';

/** `/person/<name>` every movie + show one cast/crew member is credited in. */
export const Route = createFileRoute('/_app/person/$name')({
  loader: async ({ params, context: { queryClient } }) => {
    if (!isAuthed()) throw redirect({ to: '/' });
    // Prefetched, not awaited: a provider round trip must not hold the page back
    // once the credits are in.
    void queryClient.prefetchQuery(catalogQueries.personDetails(params.name));
    await queryClient.ensureQueryData(catalogQueries.personCredits(params.name));
  },
  pendingComponent: () => <PageSkeleton rails={0} />,
  component: PersonPage,
});

function PersonPage() {
  const t = useT();
  const { name: rawName } = Route.useParams();
  const { data } = useSuspenseQuery(catalogQueries.personCredits(rawName));
  const { data: profile } = useQuery(catalogQueries.personDetails(rawName));
  const detail = profile?.person ?? null;
  const c = kromaClient();
  const results = data.results;
  const entries: CatalogEntry[] = results.map((hit) =>
    hit.type === 'show'
      ? { kind: 'show', show: toShowView(c, hit.show) }
      : { kind: 'movie', movie: toMovieView(c, hit.item) },
  );
  // The credits alone carry roles and a usable photo; the provider profile only
  // ever improves on them.
  const metas = results.map((hit) => (hit.type === 'show' ? hit.show.metadata : hit.item.metadata));
  const name = detail?.name ?? personDisplayName(metas, rawName);
  const involvement = personInvolvement(metas, rawName);
  const photo = imageUrl(detail?.profileUrl ?? involvement.profileUrl);
  const [g1, g2] = posterColors(name);
  const roles = roleLabels(t, involvement);

  return (
    <main className={PAGE_MAIN}>
      <header className="mb-9 flex items-center gap-5.5">
        <Image
          className="h-20 w-20 rounded-full shadow-[0_8px_22px_rgba(0,0,0,.45)] sm:h-26 sm:w-26"
          src={photo}
          alt={name}
          placeholder={<PersonInitials name={name} g1={g1} g2={g2} />}
          fallback={<PersonInitials name={name} g1={g1} g2={g2} />}
        />
        <div className="min-w-0">
          <h1 className={PAGE_TITLE}>{name}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[14px] font-medium text-muted">
            {roles.length ? (
              <>
                <span className="text-accent">{roles.join(' · ')}</span>
                <span className="text-dim">·</span>
              </>
            ) : null}
            <span>{t('person.titleCount', { count: entries.length })}</span>
          </div>
        </div>
      </header>
      <PersonProfile detail={detail} />
      {entries.length ? (
        <CatalogGrid entries={entries} />
      ) : (
        <EmptyState icon="user-x" title={t('person.empty')} />
      )}
    </main>
  );
}

function PersonInitials({ name, g1, g2 }: Readonly<{ name: string; g1: string; g2: string }>) {
  return (
    <span
      className="relative flex h-full w-full items-center justify-center font-display text-[34px] font-bold text-white/90"
      style={{ background: `linear-gradient(158deg, ${g1}, ${g2})` }}
    >
      <span className="absolute inset-0 bg-[radial-gradient(70%_60%_at_50%_22%,rgba(255,255,255,.2),transparent_60%)]" />
      <span className="relative">{initials(name)}</span>
    </span>
  );
}
