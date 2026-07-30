import { IconArrowRight, IconArrowUpRight, type TablerIcon } from '@tabler/icons-react';

interface ContactCardProps {
  icon: TablerIcon;
  title: string;
  description: string;
  action: string;
  href: string;
}

/** A single support channel as one clickable card: glyph, title, a line of
 *  context, and the destination it resolves to. The whole surface is the link
 *  (one large target, not a card with a small button buried in it). */
export function ContactCard({
  icon,
  title,
  description,
  action,
  href,
}: Readonly<ContactCardProps>) {
  const Icon = icon;
  // A mailto is not another site, so it must not open a new tab or get the arrow.
  const external = href.startsWith('http');
  const Arrow = external ? IconArrowUpRight : IconArrowRight;

  return (
    <a
      href={href}
      className="group flex h-full flex-col rounded-2xl border border-border bg-surface-1 p-6 transition-colors duration-200 hover:border-accent/60 hover:bg-surface-2 focus-visible:border-accent focus-visible:outline-none"
      {...(external ? { target: '_blank', rel: 'noreferrer noopener' } : {})}
    >
      <span className="flex size-11 items-center justify-center rounded-xl bg-accent-soft text-accent">
        <Icon size={22} stroke={1.75} aria-hidden />
      </span>
      <div className="mt-5">
        <h3 className="font-display text-lg font-bold text-text">{title}</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">{description}</p>
      </div>
      <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-accent">
        {action}
        <Arrow
          size={16}
          stroke={2}
          className="transition-transform duration-200 ease-out group-hover:translate-x-0.5"
          aria-hidden
        />
      </span>
    </a>
  );
}
