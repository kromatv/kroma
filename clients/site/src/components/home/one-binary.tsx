import {
  IconArrowNarrowDown,
  IconArrowNarrowRight,
  IconCircleCheckFilled,
} from '@tabler/icons-react';
import { Container } from '#site/components/container';
import { BandHeading } from '#site/components/home/heading';
import { WheelMark } from '#site/components/wheel-mark';
import { m } from '#site/paraglide/messages';

// The stack a typical *arr setup bolts together, in the order the collapse reads
// best. Product names are language-invariant; only the one-word job each used to
// own is localized, so the block reads as "these six things, one server to
// install" in either language.
const REPLACED: readonly { id: string; name: string; job: () => string }[] = [
  { id: 'acquisition', name: 'Sonarr · Radarr', job: m.home_one_binary_replaces_acquisition },
  { id: 'indexers', name: 'Prowlarr / Jackett', job: m.home_one_binary_replaces_indexers },
  { id: 'downloader', name: 'qBittorrent', job: m.home_one_binary_replaces_downloader },
  { id: 'vpn', name: 'Gluetun', job: m.home_one_binary_replaces_vpn },
  { id: 'server', name: 'Jellyfin', job: m.home_one_binary_replaces_server },
  { id: 'requests', name: 'Overseerr', job: m.home_one_binary_replaces_requests },
];

// The differentiator, made literal: the pile of parts on the left, the single
// server that replaces it on the right, with what that one server does natively.
export function OneBinary() {
  // What the one server does natively, in the order the panel lists them.
  const native = [
    m.home_one_binary_native_1(),
    m.home_one_binary_native_2(),
    m.home_one_binary_native_3(),
    m.home_one_binary_native_4(),
    m.home_one_binary_native_5(),
  ];

  return (
    <section className="py-20 sm:py-28">
      <Container>
        <div className="max-w-2xl">
          <BandHeading
            eyebrow={m.home_one_binary_eyebrow()}
            heading={m.home_one_binary_heading()}
          />
          <p className="mt-4 text-pretty text-lg leading-relaxed text-muted">
            {m.home_one_binary_lead()}
          </p>
        </div>

        <div className="mt-14 grid items-center gap-6 lg:grid-cols-[1fr_auto_1fr] lg:gap-8">
          {/* AVANT, the pile of parts you no longer run. Dimmed and struck to
              read as "gone", not as a competing feature list. */}
          <div className="opacity-80">
            <p className="mb-3 font-mono text-[0.7rem] uppercase tracking-[0.2em] text-dim">
              {m.home_one_binary_before_label()}
            </p>
            <ul className="flex flex-col divide-y divide-border/70 overflow-hidden rounded-2xl border border-border/70 bg-surface-1/30">
              {REPLACED.map(({ id, name, job }) => (
                <li key={id} className="flex items-baseline justify-between gap-4 px-4 py-3">
                  <span className="font-display text-[0.95rem] font-semibold text-muted line-through decoration-border-strong decoration-1">
                    {name}
                  </span>
                  <span className="shrink-0 font-mono text-[0.68rem] text-dim">{job()}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* The collapse: down on a phone, right on desktop. */}
          <div className="flex items-center justify-center text-accent" aria-hidden>
            <IconArrowNarrowDown size={30} stroke={1.5} className="lg:hidden" />
            <IconArrowNarrowRight size={44} stroke={1.5} className="hidden lg:block" />
          </div>

          {/* APRÈS, one panel, lit from the top like the app's raised cards. */}
          <div className="surface-hairline relative overflow-hidden rounded-2xl border border-accent/30 bg-surface-1 p-6 shadow-card">
            <div className="glow-amber pointer-events-none absolute inset-x-0 -top-20 h-44" />
            <div className="relative flex items-center gap-3">
              <WheelMark size={30} />
              <span className="font-display text-xl font-extrabold tracking-tight text-text">
                KROMA
              </span>
              <span className="ml-auto rounded-full border border-border-strong px-2.5 py-0.5 font-mono text-[0.68rem] text-muted">
                {m.home_one_binary_badge()}
              </span>
            </div>
            <ul className="relative mt-5 flex flex-col gap-2.5">
              {native.map((n) => (
                <li key={n} className="flex items-start gap-2.5 text-sm text-muted">
                  <IconCircleCheckFilled
                    size={16}
                    stroke={1.75}
                    aria-hidden
                    className="mt-0.5 shrink-0 text-accent"
                  />
                  <span>{n}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Container>
    </section>
  );
}
