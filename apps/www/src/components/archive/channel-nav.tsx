import { IconArrowDown } from '@tabler/icons-react';
import type { IconComponent } from '#site/components/download/icon';
import { formatMoment } from '#site/lib/day';
import { useLang } from '#site/lib/i18n';

export interface ChannelCard {
  id: string;
  icon: IconComponent;
  title: string;
  /** The freshest version on the channel, or null when it holds none. */
  version: string | null;
  /** When that build was made. */
  at: string | null;
  /** How often the channel moves. */
  cadence: string;
  /** How many builds it holds. */
  count: number;
}

export interface ChannelNavProps {
  cards: readonly ChannelCard[];
}

/**
 * The three channels, as the page's first screen.
 *
 * Plain anchors rather than tabs: every channel is in the prerendered HTML, so
 * jumping to one costs no JS and a shared link lands on the right section.
 */
export function ChannelNav({ cards }: Readonly<ChannelNavProps>) {
  const lang = useLang();

  return (
    <div className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:auto-cols-fr sm:grid-flow-col">
      {cards.map((card) => (
        <a
          key={card.id}
          href={`#${card.id}`}
          className="group flex flex-col gap-2 bg-surface-1/40 p-5 transition-colors hover:bg-accent-soft"
        >
          <div className="flex items-center gap-2">
            <card.icon size={17} stroke={1.75} className="shrink-0 text-accent-text" aria-hidden />
            <span className="font-display text-sm font-bold text-text">{card.title}</span>
            <span className="rounded-full border border-border px-1.5 font-sans text-[0.68rem] tabular-nums text-dim">
              {card.count}
            </span>
            <IconArrowDown
              size={14}
              stroke={2}
              className="ml-auto shrink-0 text-dim transition-transform group-hover:translate-y-0.5"
              aria-hidden
            />
          </div>
          <p className="break-words font-mono text-sm font-medium text-accent-text">
            {card.version ?? '—'}
          </p>
          <p className="mt-auto text-xs leading-relaxed text-dim">
            {card.at && <time dateTime={card.at}>{formatMoment(card.at, lang)}</time>}
            {card.at && ' · '}
            {card.cadence}
          </p>
        </a>
      ))}
    </div>
  );
}
