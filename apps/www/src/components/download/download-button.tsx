import { IconDownload, IconHash } from '@tabler/icons-react';
import { CopyButton } from '#site/components/download/copy-button';
import type { BuildFile } from '#site/lib/build-file';
import { m } from '#site/paraglide/messages';

export interface DownloadButtonProps {
  file: BuildFile;
  /** Names the platform on the pill, for a list with no heading above it to say
   *  which - two platforms ship a `.apk` and the extension alone cannot tell them apart. */
  withPlatform?: boolean;
}

/**
 * No `download` attribute: the asset redirects to another origin, where every
 * browser ignores it, so the page would be promising something it cannot do.
 *
 * The whole card is the link, stretched by the anchor's `after`, which is why
 * the checksum row is lifted above it: a copy button cannot live inside an `<a>`.
 */
export function DownloadButton({ file, withPlatform }: Readonly<DownloadButtonProps>) {
  const Glyph = file.icon;

  return (
    <div
      title={file.name}
      className="group relative flex flex-col overflow-hidden rounded-xl border border-border bg-surface-1/50 transition-colors focus-within:border-accent hover:border-accent hover:bg-accent-soft"
    >
      <a
        href={file.url}
        aria-label={`${m.download_ui_download()} ${file.name}`}
        className="flex items-center gap-3 px-3 py-2.5 after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
      >
        {Glyph && (
          <Glyph
            size={19}
            stroke={1.75}
            className="shrink-0 text-muted transition-colors group-hover:text-accent-text"
            aria-hidden
          />
        )}

        <span className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="flex min-w-0 items-baseline gap-1.5">
            {withPlatform && (
              <span className="truncate font-sans text-sm font-semibold text-text">
                {file.platform}
              </span>
            )}
            <span className="shrink-0 font-mono text-xs font-medium text-muted">{file.kind}</span>
          </span>
          <span className="truncate font-sans text-xs tabular-nums text-dim">{file.meta}</span>
        </span>

        <IconDownload
          size={16}
          stroke={2}
          className="shrink-0 text-dim transition-all group-hover:translate-y-0.5 group-hover:text-accent-text"
          aria-hidden
        />
      </a>

      {file.sha256 && (
        <div className="relative z-10 flex items-center justify-between gap-2 border-t border-border/60 pl-3 pr-1.5 py-1">
          <span className="flex min-w-0 items-center gap-1.5">
            <IconHash size={12} stroke={2} className="shrink-0 text-dim" aria-hidden />
            <code className="truncate font-mono text-[0.68rem] text-dim">
              {`${file.sha256.slice(0, 12)}…`}
            </code>
          </span>
          <CopyButton value={file.sha256} />
        </div>
      )}
    </div>
  );
}
