import {
  IconCloudOff,
  IconLicense,
  IconLock,
  IconWorldOff,
  type TablerIcon,
} from '@tabler/icons-react';
import { Button } from '#site/components/button';
import { Container } from '#site/components/container';
import { BandHeading } from '#site/components/home/heading';
import { site } from '#site/lib/site';
import { m } from '#site/paraglide/messages';

const POINTS: readonly {
  id: string;
  Icon: TablerIcon;
  title: () => string;
  sub: () => string;
}[] = [
  {
    id: 'free',
    Icon: IconLicense,
    title: m.home_self_host_free_title,
    sub: m.home_self_host_free_sub,
  },
  {
    id: 'private',
    Icon: IconLock,
    title: m.home_self_host_private_title,
    sub: m.home_self_host_private_sub,
  },
  {
    id: 'noCentral',
    Icon: IconWorldOff,
    title: m.home_self_host_no_central_title,
    sub: m.home_self_host_no_central_sub,
  },
  {
    id: 'offline',
    Icon: IconCloudOff,
    title: m.home_self_host_offline_title,
    sub: m.home_self_host_offline_sub,
  },
];

// Kept on-palette: the "window controls" are neutral, not the decorative
// traffic lights that would drag a second colour in.
export function SelfHostBand() {
  return (
    <section className="py-20 sm:py-28">
      <Container>
        <div className="surface-hairline relative overflow-hidden rounded-3xl border border-border-strong bg-surface-1 p-8 sm:p-12">
          <div className="glow-amber pointer-events-none absolute inset-x-0 -top-24 h-56" />
          <div className="relative grid gap-10 lg:grid-cols-2 lg:items-center lg:gap-16">
            <div>
              <BandHeading
                eyebrow={m.home_self_host_eyebrow()}
                heading={m.home_self_host_heading()}
              />
              <p className="mt-4 text-pretty leading-relaxed text-muted">
                {m.home_self_host_lead()}
              </p>

              <dl className="mt-8 grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
                {POINTS.map(({ id, Icon, title, sub }) => (
                  <div key={id} className="flex items-start gap-3">
                    <Icon
                      size={20}
                      stroke={1.75}
                      aria-hidden
                      className="mt-0.5 shrink-0 text-accent"
                    />
                    <div>
                      <dt className="font-display text-sm font-bold text-text">{title()}</dt>
                      <dd className="mt-0.5 text-sm text-muted">{sub()}</dd>
                    </div>
                  </div>
                ))}
              </dl>

              <div className="mt-9">
                <Button href={site.repo} variant="outline">
                  {m.home_self_host_github()}
                </Button>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-border bg-bg/80 shadow-card">
              <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
                <span className="size-2.5 rounded-full border border-border-strong" aria-hidden />
                <span className="size-2.5 rounded-full border border-border-strong" aria-hidden />
                <span className="size-2.5 rounded-full border border-border-strong" aria-hidden />
                <span className="ml-2 font-mono text-[0.7rem] text-dim">
                  {m.home_self_host_terminal()}
                </span>
              </div>
              <pre className="overflow-x-auto px-4 py-4 font-mono text-[0.82rem] leading-relaxed text-muted">
                <code>
                  <span className="text-accent">$</span> docker run -d -p 4040:4040 \{'\n'}
                  {'    '}-v /volume1/video:/media \{'\n'}
                  {'    '}-v kroma-data:/data \{'\n'}
                  {'    '}ghcr.io/maxscharwath/kroma
                </code>
              </pre>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
