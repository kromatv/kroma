import { IconCheck } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { Disclosure } from '#site/components/download/disclosure';
import type { IconComponent } from '#site/components/download/icon';
import { WheelMark } from '#site/components/wheel-mark';
import { m } from '#site/paraglide/messages';

export interface PlatformEntryProps {
  id?: string;
  heading?: 'h2' | 'h3';
  note?: string;
  icon: IconComponent;
  name: string;
  description: string;
  badge?: string;
  wideIcon?: boolean;
  children: ReactNode;
  help?: ReactNode;
}

/** The app identity and action stay in a fixed row; setup expands below it. */
export function PlatformEntry({
  id,
  heading: Heading = 'h3',
  note,
  icon: Icon,
  name,
  description,
  badge,
  wideIcon,
  children,
  help,
}: Readonly<PlatformEntryProps>) {
  return (
    <article id={id} className="relative p-5 sm:p-9 lg:p-10">
      <div className="grid items-start gap-7 sm:grid-cols-[1fr_1.05fr] sm:gap-10">
        <div className="flex items-start gap-4 sm:block">
          <div className="relative inline-flex size-16 shrink-0 items-center justify-center rounded-[1.35rem] border border-border-strong bg-surface-2 shadow-sm sm:mb-6 sm:size-24">
            <WheelMark size={52} className="size-9 sm:size-[52px]" />
            <span
              className={`absolute -bottom-1.5 -right-1.5 flex h-8 items-center justify-center rounded-[0.65rem] border border-border-strong bg-surface-1 text-muted ${wideIcon ? 'w-14' : 'w-8'}`}
            >
              <Icon size={18} aria-hidden />
            </span>
          </div>
          <div>
            <Heading className="font-display text-2xl font-bold tracking-tight text-text sm:text-[1.85rem]">
              <span className="mb-1.5 block font-sans text-xs font-medium tracking-wide text-muted">
                {m.download_title_prefix()}
              </span>{' '}
              {name}
            </Heading>
            {badge && <p className="mt-2 text-xs font-medium text-accent-text">{badge}</p>}
            <p className="mt-2 text-sm leading-relaxed text-muted">{description}</p>
            {note && (
              <p className="mt-3 flex items-center gap-1.5 text-xs text-dim">
                <IconCheck size={14} stroke={1.8} aria-hidden />
                {note}
              </p>
            )}
          </div>
        </div>
        <div className="space-y-3 sm:self-center">{children}</div>
      </div>
      {help && (
        <div className="mt-7 border-t border-border/60 pt-4">
          <Disclosure label={m.download_install_help()}>{help}</Disclosure>
        </div>
      )}
    </article>
  );
}
