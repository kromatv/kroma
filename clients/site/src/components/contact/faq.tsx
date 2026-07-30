import { IconChevronRight } from '@tabler/icons-react';
import type { ReactNode } from 'react';

interface FaqEntry {
  question: string;
  /** Rich answer, so a link (e.g. to the privacy page) can live inside. */
  answer: ReactNode;
}

/** A short FAQ built on native <details>/<summary>. No client JS: the disclosure
 *  works from the prerendered HTML, before (and without) hydration, the same
 *  JS-free pattern the header's mobile menu uses, which keeps a static page
 *  genuinely static and SSR-safe. */
export function Faq({ items }: Readonly<{ items: readonly FaqEntry[] }>) {
  return (
    <div className="border-t border-border/70">
      {items.map((item) => (
        <details key={item.question} className="group border-b border-border/70">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 [&::-webkit-details-marker]:hidden">
            <span className="font-display text-lg font-semibold text-text transition-colors group-hover:text-accent">
              {item.question}
            </span>
            <IconChevronRight
              size={20}
              stroke={2}
              className="shrink-0 text-dim transition-transform duration-200 ease-out group-open:rotate-90"
            />
          </summary>
          <div className="max-w-2xl pb-6 pr-8 leading-relaxed text-muted">{item.answer}</div>
        </details>
      ))}
    </div>
  );
}
