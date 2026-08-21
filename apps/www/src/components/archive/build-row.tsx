import { IconArrowUpRight, IconChevronRight } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { DownloadButton } from '#site/components/download/download-button';
import type { BuildFile } from '#site/lib/build-file';
import { formatMoment } from '#site/lib/day';
import { useLang } from '#site/lib/i18n';
import { m } from '#site/paraglide/messages';

export interface BuildRowProps {
  /** The version, or the commit when a build carries none. */
  version: string;
  /** When the build was made. Absent for one whose timestamp cannot be read. */
  at?: string | null;
  /** The commit title or the release's opening line. */
  note?: string | null;
  /** A short mono tag beside the version, such as a commit sha. */
  tag?: ReactNode;
  files: readonly BuildFile[];
  /** Where the build came from, on GitHub. */
  source?: { href: string; label: string };
  /** Extra detail under the files, such as checksums. */
  /** The newest build on its channel: marked, and open on arrival. */
  featured?: boolean;
}

/**
 * One build in a channel, folding out to every file it hands over.
 *
 * A native `<details>`, so the whole list is in the prerendered HTML and a
 * reader with no JS can still open any of it.
 */
export function BuildRow({
  version,
  at,
  note,
  tag,
  files,
  source,
  featured,
}: Readonly<BuildRowProps>) {
  const lang = useLang();
  const made = formatMoment(at, lang);

  return (
    <details
      open={featured}
      className="group border-b border-border/60 first:border-t first:border-border/60"
    >
      <summary className="grid cursor-pointer list-none grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-0.5 py-3.5 [&::-webkit-details-marker]:hidden">
        <IconChevronRight
          size={15}
          stroke={2}
          className="row-span-2 shrink-0 self-start text-dim transition-transform duration-200 ease-out group-open:rotate-90 sm:row-span-1 sm:self-center"
          aria-hidden
        />

        <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="break-all font-mono text-base font-medium text-text">{version}</span>
          {tag}
          {featured && (
            <span className="rounded-full bg-accent-soft px-2 py-0.5 font-sans text-[0.62rem] font-bold uppercase tracking-wider text-accent-text">
              {m.archive_latest()}
            </span>
          )}
          {at && made && (
            <time dateTime={at} className="shrink-0 text-xs tabular-nums text-dim">
              {made}
            </time>
          )}
        </div>

        <span className="shrink-0 self-start rounded-full border border-border px-2 py-0.5 font-sans text-xs tabular-nums text-dim sm:self-center">
          {files.length}
        </span>

        {note && <span className="col-start-2 min-w-0 truncate text-sm text-muted">{note}</span>}
      </summary>

      <div className="pb-5 pl-6">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {files.map((file) => (
            <DownloadButton key={file.key} file={file} withPlatform />
          ))}
        </div>
        {source && (
          <a
            href={source.href}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-accent-text transition-opacity hover:opacity-80"
          >
            {source.label}
            <IconArrowUpRight size={14} stroke={2} aria-hidden />
          </a>
        )}
      </div>
    </details>
  );
}
