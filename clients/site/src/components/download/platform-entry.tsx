import type { ReactNode } from 'react';
import { CodeBlock } from '#site/components/download/code-block';
import type { IconComponent } from '#site/components/download/icon';
import { StepList } from '#site/components/download/step-list';
import { m } from '#site/paraglide/messages';

export interface PlatformEntryProps {
  icon: IconComponent;
  /** Device / OS name, e.g. "Samsung (Tizen)". */
  name: string;
  /** Artifact extensions rendered as monospace badges, e.g. ['.wgt']. */
  artifacts?: readonly string[];
  /** Flag store/beta channels (TestFlight, Firebase) so expectations are set. */
  beta?: boolean;
  /** The one-time-setup / heads-up note, typically a <Callout>. */
  setup?: ReactNode;
  /** A short numbered procedure, when clicking through beats a command. Messages
   *  with their markers, rendered by the StepList. */
  steps?: readonly string[];
  /** The representative command, verbatim. Optional (Apple TV needs none). */
  code?: string;
  /** Caption for that command; defaults to the CodeBlock's own `bash`. */
  codeLabel?: string;
  /** Trailing prose for this row only (Synology's manual-install fallback). */
  after?: ReactNode;
}

/**
 * One device inside a family. A row, not a card: an icon tile, the name with its
 * artifact badges, then the one-time setup, the steps or command, and any closing
 * note stacked beneath. Rows share a hairline divider within the family panel,
 * which reads as an edited list rather than a grid of look-alike tiles.
 */
export function PlatformEntry({
  icon: Icon,
  name,
  artifacts,
  beta,
  setup,
  steps,
  code,
  codeLabel,
  after,
}: Readonly<PlatformEntryProps>) {
  return (
    <div className="border-t border-border/60 py-6 first:border-t-0 first:pt-0 last:pb-0">
      <div className="flex items-start gap-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-2 text-accent">
          <Icon size={20} stroke={1.75} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            <h4 className="font-display text-base font-bold text-text">{name}</h4>
            {artifacts?.map((ext) => (
              <code
                key={ext}
                className="rounded-md bg-wash px-1.5 py-0.5 font-mono text-xs text-accent"
              >
                {ext}
              </code>
            ))}
            {beta && (
              <span className="rounded-full border border-border-strong px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-wider text-dim">
                {m.download_ui_beta()}
              </span>
            )}
          </div>
          {setup && <div className="mt-3">{setup}</div>}
          {(steps || code) && (
            <div className="mt-3 space-y-4">
              {steps && <StepList steps={steps} />}
              {code && <CodeBlock label={codeLabel} code={code} />}
            </div>
          )}
          {after}
        </div>
      </div>
    </div>
  );
}
