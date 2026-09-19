import type { ReactNode } from 'react';
import { L } from '#site/components/localized-link';
import { m } from '#site/paraglide/messages';

function Note({
  title,
  body,
  children,
}: Readonly<{ title: string; body: string; children?: ReactNode }>) {
  return (
    <section>
      <h2 className="font-display text-base font-bold text-text">{title}</h2>
      <p className="mt-2 text-pretty text-sm leading-relaxed text-muted">{body}</p>
      {children}
    </section>
  );
}

/** The small print, as two columns of text under a hairline rather than two
 * more cards: it is read once, and it should weigh like a footnote. */
export function Notes() {
  return (
    <div className="grid gap-8 border-t border-border pt-10 md:grid-cols-2 md:gap-12">
      <Note title={m.stats_method_title()} body={m.stats_method_body()} />
      <Note title={m.stats_switch_title()} body={m.stats_switch_body()}>
        <L to="/privacy" className="mt-3 inline-block text-sm text-accent-text hover:underline">
          {m.stats_privacy_link()}
        </L>
      </Note>
    </div>
  );
}
