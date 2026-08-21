import type { ReactNode } from 'react';
import { Callout } from '#site/components/download/callout';
import { CodeBlock } from '#site/components/download/code-block';
import { Disclosure } from '#site/components/download/disclosure';
import { DownloadButton } from '#site/components/download/download-button';
import type { IconComponent } from '#site/components/download/icon';
import { JoinButton } from '#site/components/download/join-button';
import { StepList } from '#site/components/download/step-list';
import { Rich } from '#site/components/rich';
import { fromDownload } from '#site/lib/build-file';
import type { SiteDownload } from '#site/lib/releases';
import { m } from '#site/paraglide/messages';

export interface PlatformEntryProps {
  icon: IconComponent;
  name: string;
  downloads?: readonly SiteDownload[];
  /** Where a platform with no downloadable file takes a tester instead. */
  join?: { href: string; channel: string };
  beta?: boolean;
  /** What the platform asks for before it accepts a build. */
  note?: { icon: IconComponent; tag: string; body: string };
  /** The procedure. Folded behind `label` when it has one, inline when it has none. */
  install?: {
    label?: string;
    steps?: readonly string[];
    code?: string;
    codeLabel?: string;
  };
  after?: ReactNode;
}

/** One device inside a family: a row, not a card, sharing a hairline divider
 *  with its siblings in the family panel. */
export function PlatformEntry({
  icon: Icon,
  name,
  downloads,
  join,
  beta,
  note,
  install,
  after,
}: Readonly<PlatformEntryProps>) {
  const procedure = install && (
    <div className="space-y-4">
      {install.steps && <StepList steps={install.steps} />}
      {install.code && <CodeBlock label={install.codeLabel} code={install.code} />}
    </div>
  );

  return (
    <div className="border-t border-border/60 py-6 first:border-t-0 first:pt-0 last:pb-0">
      <div className="flex items-start gap-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-2 text-accent-text">
          <Icon size={20} stroke={1.75} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            <h4 className="font-display text-base font-bold text-text">{name}</h4>
            {beta && (
              <span className="rounded-full border border-border-strong px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-wider text-dim">
                {m.download_ui_beta()}
              </span>
            )}
          </div>
          {((downloads && downloads.length > 0) || join) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {downloads?.map((download) => (
                <DownloadButton key={download.name} file={fromDownload(download)} />
              ))}
              {join && <JoinButton href={join.href} channel={join.channel} />}
            </div>
          )}
          {note && (
            <div className="mt-3">
              <Callout icon={note.icon} tag={note.tag}>
                <Rich>{note.body}</Rich>
              </Callout>
            </div>
          )}
          {procedure && (
            <div className="mt-3">
              {install?.label ? (
                <Disclosure label={install.label}>{procedure}</Disclosure>
              ) : (
                procedure
              )}
            </div>
          )}
          {after}
        </div>
      </div>
    </div>
  );
}
