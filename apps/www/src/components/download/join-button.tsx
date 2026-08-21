import { IconArrowUpRight } from '@tabler/icons-react';
import { m } from '#site/paraglide/messages';

export interface JoinButtonProps {
  href: string;
  channel: string;
}

export function JoinButton({ href, channel }: Readonly<JoinButtonProps>) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="group inline-flex items-center gap-2.5 rounded-xl border border-border-strong bg-surface-2/40 py-2 pl-4 pr-3 transition-colors hover:border-accent hover:bg-accent-soft"
    >
      <span className="font-sans text-sm font-medium text-text">{m.download_ui_join_beta()}</span>
      <span className="font-sans text-xs text-dim">{channel}</span>
      <IconArrowUpRight
        size={15}
        stroke={2}
        className="shrink-0 text-accent-text transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
        aria-hidden
      />
    </a>
  );
}
