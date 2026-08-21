import { Container } from '#site/components/container';
import { BandHeading } from '#site/components/home/heading';
import { m } from '#site/paraglide/messages';

const CODECS: readonly { label: string; hero?: true }[] = [
  { label: 'HEVC / H.265', hero: true },
  { label: '10-bit · HDR' },
  { label: 'AV1' },
  { label: 'H.264' },
  { label: 'AAC' },
  { label: 'AC3 / EAC3' },
];

export function DirectPlay() {
  return (
    <section className="py-20 sm:py-28">
      <Container>
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center lg:gap-16">
          <div>
            <BandHeading
              eyebrow={m.home_direct_play_eyebrow()}
              heading={m.home_direct_play_heading()}
            />
            <p className="mt-5 text-pretty text-lg leading-relaxed text-muted">
              {m.home_direct_play_lead()}
            </p>
            <p className="mt-4 max-w-md font-mono text-xs leading-relaxed text-dim">
              {m.home_direct_play_exception()}
            </p>
          </div>

          <div className="surface-hairline rounded-2xl border border-border bg-surface-1/50 p-6 shadow-card sm:p-8">
            <p className="font-mono text-[0.7rem] uppercase tracking-[0.2em] text-dim">
              {m.home_direct_play_decoded_by()}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {CODECS.map((c) => (
                <span
                  key={c.label}
                  className={`rounded-md border px-2.5 py-1 font-mono text-xs ${
                    c.hero
                      ? 'border-accent/40 bg-accent-soft text-accent-text'
                      : 'border-border bg-bg text-muted'
                  }`}
                >
                  {c.label}
                </span>
              ))}
            </div>

            <div className="mt-8 h-px bg-border" />

            <div className="mt-6">
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-xs text-muted">
                  {m.home_direct_play_cpu_label()}
                </span>
                <span className="font-mono text-xs text-accent-text">
                  {m.home_direct_play_cpu_state()}
                </span>
              </div>
              <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-surface-3">
                <div className="h-full w-[4%] rounded-full bg-accent" />
              </div>
              <p className="mt-3 text-xs leading-relaxed text-dim">
                {m.home_direct_play_cpu_note()}
              </p>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
