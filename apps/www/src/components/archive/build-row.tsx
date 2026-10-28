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
  /** Mark the newest build while keeping the file list folded. */
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
    <details className="group/build border-b border-border/60 last:border-b-0 open:bg-surface-2/25">
      <summary className="grid cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto_1rem] items-center gap-x-3 px-4 py-4 transition-colors hover:bg-wash sm:grid-cols-[minmax(0,1fr)_14rem_6rem_1rem] sm:gap-x-4 sm:px-5 [&::-webkit-details-marker]:hidden">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="break-all font-mono text-sm font-medium text-text">{version}</span>
          {tag}
          {featured && (
            <span className="rounded-md bg-accent-soft px-1.5 py-0.5 text-[0.6rem] font-semibold text-accent-text">
              {m.archive_latest()}
            </span>
          )}
        </div>
        {at && made && (
          <time
            dateTime={at}
            className="col-start-1 row-start-2 mt-1 text-[0.68rem] tabular-nums text-muted sm:col-start-2 sm:row-start-1 sm:mt-0 sm:text-xs"
          >
            {made}
          </time>
        )}
        <span className="col-start-2 row-start-1 text-right text-[0.68rem] tabular-nums text-muted sm:col-start-3 sm:text-xs">
          {m.archive_file_count({ count: String(files.length) })}
        </span>
        <IconChevronRight
          size={15}
          stroke={1.75}
          className="col-start-3 row-start-1 shrink-0 text-dim transition-transform duration-200 group-open/build:rotate-90 sm:col-start-4"
          aria-hidden
        />
        {note && (
          <span className="col-start-1 mt-1 min-w-0 truncate text-xs text-muted sm:col-span-3">
            {note}
          </span>
        )}
      </summary>
      <div className="border-t border-border/60 bg-surface-2/20 px-4 py-5 sm:px-5">
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
            className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-accent-text transition-opacity hover:opacity-80"
          >
            {source.label}
            <IconArrowUpRight size={13} stroke={1.75} aria-hidden />
          </a>
        )}
      </div>
    </details>
  );
}
