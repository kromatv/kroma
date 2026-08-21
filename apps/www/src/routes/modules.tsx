import { createFileRoute } from '@tanstack/react-router';
import { Container } from '#site/components/container';
import { AccentHeading } from '#site/components/home/heading';
import { CatalogGrid, RegistryNote } from '#site/components/modules/catalog-grid';
import { HowItWorks, InstallFlow } from '#site/components/modules/how-it-works';
import { getLocale } from '#site/lib/i18n';
import { seo } from '#site/lib/seo';
import { m } from '#site/paraglide/messages';

export const Route = createFileRoute('/modules')({
  head: () =>
    seo({
      lang: getLocale(),
      title: m.modules_head_title(),
      path: '/modules',
      description: m.modules_hero_lead(),
    }),
  component: Modules,
});

function Modules() {
  return (
    <>
      <section className="pt-20 pb-4 sm:pt-28">
        <Container>
          <div className="max-w-3xl">
            <p className="mb-3 font-sans text-xs font-bold uppercase tracking-[0.18em] text-accent-text">
              {m.modules_hero_eyebrow()}
            </p>
            <h1 className="text-balance font-display text-4xl font-extrabold leading-[1.05] text-text sm:text-5xl">
              <AccentHeading text={m.modules_hero_title()} />
            </h1>
            <p className="mt-5 text-pretty text-lg leading-relaxed text-muted">
              {m.modules_hero_lead()}
            </p>
          </div>
        </Container>
      </section>

      <HowItWorks />
      <CatalogGrid />
      <InstallFlow />
      <RegistryNote />
    </>
  );
}
