import { catalog } from 'virtual:kroma-modules';
import { site } from '@kroma/site-meta';
import { IconArrowNarrowRight, IconShieldCheck } from '@tabler/icons-react';
import { ModuleCard } from '#site/components/modules/module-card';
import { Section } from '#site/components/section';
import { catalogDay, ordered } from '#site/lib/modules';
import { m } from '#site/paraglide/messages';

export function CatalogGrid() {
  const mods = ordered(catalog.modules);
  const day = catalogDay(catalog.generatedAt);

  return (
    <Section id="catalogue" title={m.modules_catalog_title()} intro={m.modules_catalog_lead()}>
      {mods.length === 0 ? (
        <p className="text-center text-sm text-muted">{m.modules_catalog_empty()}</p>
      ) : (
        <>
          <div className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2">
            {mods.map((mod) => (
              <ModuleCard key={mod.id} mod={mod} />
            ))}
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
            {day && (
              <p className="font-mono text-[0.7rem] text-dim">
                {m.modules_catalog_updated()} {day}
              </p>
            )}
            <a
              href={site.modulesUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-2 font-sans text-sm font-semibold text-accent-text transition-colors hover:text-accent-hover"
            >
              {m.modules_catalog_link()}
              <IconArrowNarrowRight size={18} stroke={1.75} aria-hidden />
            </a>
          </div>
        </>
      )}
    </Section>
  );
}

export function RegistryNote() {
  return (
    <Section>
      <div className="mx-auto flex max-w-3xl gap-4 rounded-2xl border border-border bg-surface-1/40 p-6">
        <IconShieldCheck
          size={24}
          stroke={1.75}
          aria-hidden
          className="shrink-0 text-accent-text"
        />
        <div>
          <h2 className="font-display text-lg font-bold leading-snug text-text">
            {m.modules_registry_title()}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">{m.modules_registry_body()}</p>
        </div>
      </div>
    </Section>
  );
}
