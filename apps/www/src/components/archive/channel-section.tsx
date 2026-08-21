import type { ReactNode } from 'react';
import { Callout } from '#site/components/download/callout';
import type { IconComponent } from '#site/components/download/icon';

export interface ChannelSectionProps {
  /** The anchor the channel nav jumps to. */
  id: string;
  icon: IconComponent;
  title: string;
  lead: string;
  /** How many builds the channel holds. */
  count?: number;
  /** The one thing to know before installing from here. */
  note?: { icon: IconComponent; tag: string; body: string };
  children: ReactNode;
}

/** One channel on the archive: what it is, what it costs you, then its builds. */
export function ChannelSection({
  id,
  icon: Icon,
  title,
  lead,
  count,
  note,
  children,
}: Readonly<ChannelSectionProps>) {
  return (
    <section
      id={id}
      className="scroll-mt-24 border-t border-border/60 pt-12 first:border-t-0 first:pt-0"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Icon size={22} stroke={1.75} className="shrink-0 text-accent-text" aria-hidden />
        <h2 className="font-display text-2xl font-extrabold text-text">{title}</h2>
        {count !== undefined && count > 0 && (
          <span className="rounded-full border border-border-strong px-2 py-0.5 font-sans text-xs font-medium tabular-nums text-dim">
            {count}
          </span>
        )}
      </div>
      <p className="mt-3 max-w-2xl text-pretty leading-relaxed text-muted">{lead}</p>
      {note && (
        <div className="mt-5 max-w-2xl">
          <Callout icon={note.icon} tag={note.tag}>
            {note.body}
          </Callout>
        </div>
      )}
      <div className="mt-8">{children}</div>
    </section>
  );
}
