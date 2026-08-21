import { catalog } from 'virtual:kroma-modules';
import { IconArrowNarrowRight } from '@tabler/icons-react';
import { Container } from '#site/components/container';
import { BandHeading } from '#site/components/home/heading';
import { L } from '#site/components/localized-link';
import { ordered } from '#site/lib/modules';
import { m } from '#site/paraglide/messages';

export function Modules() {
  const mods = ordered(catalog.modules);

  return (
    <section id="modules" className="scroll-mt-24 py-20 sm:py-28">
      <Container>
        <div className="grid gap-10 lg:grid-cols-[minmax(0,26rem)_1fr] lg:gap-16">
          <div>
            <BandHeading eyebrow={m.home_modules_eyebrow()} heading={m.home_modules_title()} />
            <p className="mt-4 text-pretty text-lg leading-relaxed text-muted">
              {m.home_modules_intro()}
            </p>
            <L
              to="/modules"
              className="mt-6 inline-flex items-center gap-2 font-sans text-sm font-semibold text-accent-text transition-colors hover:text-accent-hover"
            >
              {m.home_modules_cta()}
              <IconArrowNarrowRight size={18} stroke={1.75} aria-hidden />
            </L>
          </div>

          {mods.length > 0 && (
            <div>
              <p className="mb-4 font-mono text-[0.7rem] uppercase tracking-[0.2em] text-dim">
                {mods.length} {m.home_modules_official()}
              </p>
              <ul className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-3">
                {mods.map((mod) => (
                  <li
                    key={mod.id}
                    className="flex items-center gap-2.5 bg-surface-1/40 px-3.5 py-3 transition-colors duration-200 hover:bg-surface-1"
                  >
                    {mod.icon && (
                      <img
                        src={mod.icon}
                        alt=""
                        aria-hidden
                        width={22}
                        height={22}
                        className="size-[22px] shrink-0 rounded-md"
                      />
                    )}
                    <span className="truncate font-sans text-[0.82rem] font-medium text-muted">
                      {mod.name}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Container>
    </section>
  );
}
