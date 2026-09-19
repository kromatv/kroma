import { createFileRoute } from '@tanstack/react-router';
import { Container } from '#site/components/container';
import { DayByDay } from '#site/components/stats/day-by-day';
import { Fleet } from '#site/components/stats/fleet';
import { StatsHero } from '#site/components/stats/hero';
import { Notes } from '#site/components/stats/notes';
import { Numbers } from '#site/components/stats/numbers';
import { useStats } from '#site/components/stats/use-stats';
import { getLocale } from '#site/lib/i18n';
import { seo } from '#site/lib/seo';
import { m } from '#site/paraglide/messages';

export const Route = createFileRoute('/stats')({
  head: () =>
    seo({
      lang: getLocale(),
      title: m.stats_head_title(),
      description: m.stats_head_description(),
      path: '/stats',
    }),
  component: StatsPage,
});

const PLACEHOLDERS = ['trend', 'numbers', 'fleet'];

function Loading() {
  return (
    <output aria-label={m.stats_loading()} className="flex flex-col gap-14 sm:gap-16">
      {PLACEHOLDERS.map((id) => (
        <div key={id} className="h-64 rounded-2xl bg-wash motion-safe:animate-pulse" />
      ))}
    </output>
  );
}

function StatsPage() {
  const state = useStats();
  return (
    <>
      <StatsHero state={state} />
      <Container>
        <div className="flex flex-col gap-14 pb-20 sm:gap-16 sm:pb-24">
          {state.kind === 'loading' && <Loading />}
          {state.kind === 'ready' && (
            <>
              <DayByDay stats={state.stats} />
              <Numbers stats={state.stats} />
              <Fleet stats={state.stats} />
            </>
          )}
          <Notes />
        </div>
      </Container>
    </>
  );
}
