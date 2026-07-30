import { IconExternalLink } from '@tabler/icons-react';
import type { IconComponent } from '#site/components/download/icon';
import { Panel } from '#site/components/download/panel';
import { PlatformEntry, type PlatformEntryProps } from '#site/components/download/platform-entry';
import { m } from '#site/paraglide/messages';

export interface PlatformFamilyProps {
  icon: IconComponent;
  title: string;
  intro: string;
  docHref: string;
  entries: readonly PlatformEntryProps[];
}

/** A device family: the label pinned in a left rail that trails the reader
 *  down its entries on desktop, the entries collected in a panel on the right. */
export function PlatformFamily({
  icon: Icon,
  title,
  intro,
  docHref,
  entries,
}: Readonly<PlatformFamilyProps>) {
  return (
    <div className="grid gap-6 lg:grid-cols-[15rem_1fr] lg:gap-10">
      <div className="lg:sticky lg:top-24 lg:self-start">
        <div className="flex items-center gap-2.5">
          <Icon size={22} stroke={1.75} className="text-accent" aria-hidden />
          <h3 className="font-display text-xl font-extrabold text-text">{title}</h3>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-muted">{intro}</p>
        <a
          href={docHref}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-accent transition-opacity hover:opacity-80"
        >
          {m.download_ui_detailed_steps()}
          <IconExternalLink size={14} stroke={1.75} aria-hidden />
        </a>
      </div>
      <Panel>
        {entries.map((entry) => (
          <PlatformEntry key={entry.name} {...entry} />
        ))}
      </Panel>
    </div>
  );
}
