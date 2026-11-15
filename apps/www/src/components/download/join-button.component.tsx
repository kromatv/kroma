import { IconArrowUpRight } from '@tabler/icons-react';
import { m } from '#site/paraglide/messages';

export interface JoinButtonProps {
  href: string;
  channel: string;
  label?: string;
}

export function JoinButton({ href, channel, label }: Readonly<JoinButtonProps>) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="group flex w-full items-center justify-between gap-3 rounded-xl border border-accent bg-accent px-5 py-4 text-accent-ink transition-colors hover:bg-accent-hover"
    >
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{label ?? m.download_ui_join_beta()}</span>
        <span className="mt-1 block text-xs text-accent-ink/75">{channel}</span>
      </span>
      <IconArrowUpRight
        size={16}
        stroke={1.75}
        className="shrink-0 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
        aria-hidden
      />
    </a>
  );
}
