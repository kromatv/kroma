import { IconBoxMultiple, IconPlugConnected, IconTag } from '@tabler/icons-react';
import { Section } from '#site/components/section';
import { m } from '#site/paraglide/messages';

const POINTS = [
  {
    id: 'process',
    Icon: IconBoxMultiple,
    title: m.modules_what_1_title,
    body: m.modules_what_1_body,
  },
  {
    id: 'capability',
    Icon: IconPlugConnected,
    title: m.modules_what_2_title,
    body: m.modules_what_2_body,
  },
  { id: 'release', Icon: IconTag, title: m.modules_what_3_title, body: m.modules_what_3_body },
] as const;

export function HowItWorks() {
  return (
    <Section title={m.modules_what_title()}>
      <div className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-3">
        {POINTS.map(({ id, Icon, title, body }) => (
          <div key={id} className="bg-surface-1/40 p-6">
            <Icon size={22} stroke={1.75} aria-hidden className="text-accent-text" />
            <h3 className="mt-4 font-display text-lg font-bold leading-snug text-text">
              {title()}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{body()}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

export function InstallFlow() {
  const steps = [m.modules_install_1(), m.modules_install_2(), m.modules_install_3()];

  return (
    <Section title={m.modules_install_title()}>
      <ol className="mx-auto grid max-w-4xl gap-4 sm:grid-cols-3">
        {steps.map((step, i) => (
          <li
            key={step}
            className="rounded-2xl border border-border bg-surface-1/40 p-6 text-sm leading-relaxed text-muted"
          >
            <span className="font-mono text-[0.7rem] font-bold tracking-[0.16em] text-accent-text">
              {String(i + 1).padStart(2, '0')}
            </span>
            <p className="mt-3">{step}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}
