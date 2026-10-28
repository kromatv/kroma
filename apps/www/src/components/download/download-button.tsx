import { IconDownload, IconHash } from '@tabler/icons-react';
import { Disclosure } from '#site/components/download/disclosure';
import { CopyButton } from '#site/components/download/copy-button';
import type { BuildFile } from '#site/lib/build-file';
import { m } from '#site/paraglide/messages';

export interface DownloadButtonProps {
  file: BuildFile;
  label?: string;
  prominent?: boolean;
  showChecksum?: boolean;
  /** Names the platform on the pill, for a list with no heading above it to say
   *  which - two platforms ship a `.apk` and the extension alone cannot tell them apart. */
  withPlatform?: boolean;
}

/**
 * No `download` attribute: the asset redirects to another origin, where every
 * browser ignores it, so the page would be promising something it cannot do.
 *
 */
export function DownloadButton({
  file,
  withPlatform,
  label,
  prominent,
  showChecksum = true,
}: Readonly<DownloadButtonProps>) {
  const Glyph = file.icon;
  const primaryStyle =
    file.sha256 && showChecksum
      ? 'rounded-t-xl bg-accent text-accent-ink'
      : 'rounded-xl bg-accent text-accent-ink';

  return (
    <div
      title={file.name}
      className={`group relative flex flex-col rounded-xl border transition-colors focus-within:border-accent hover:border-accent ${prominent ? 'border-accent bg-accent transition-shadow hover:shadow-[0_5px_24px_-9px_var(--kroma-accent)]' : 'border-border-strong bg-surface-2/40 hover:bg-wash'}`}
    >
      <a
        href={file.url}
        aria-label={`${label ?? m.download_ui_download()} ${file.name}`}
        className={`flex items-center gap-3 px-5 py-4 focus-visible:outline-none ${prominent ? primaryStyle : 'text-text'}`}
      >
        {Glyph && !label && (
          <Glyph
            size={19}
            stroke={1.75}
            className={`shrink-0 transition-colors ${prominent ? 'text-accent-ink' : 'text-muted group-hover:text-accent-text'}`}
            aria-hidden
          />
        )}

        <span className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="flex min-w-0 items-baseline gap-1.5">
            {(label || withPlatform) && (
              <span
                className={`truncate font-sans text-sm font-semibold ${prominent ? 'text-accent-ink' : 'text-text'}`}
              >
                {label ?? file.platform}
              </span>
            )}
            {!label && (
              <span className="shrink-0 font-mono text-xs font-medium text-muted">{file.kind}</span>
            )}
          </span>
          <span
            className={`mt-1 truncate font-sans text-xs tabular-nums ${prominent ? 'text-accent-ink/75' : 'text-muted'}`}
          >
            {file.meta}
          </span>
        </span>

        <IconDownload
          size={16}
          stroke={2}
          className={`shrink-0 transition-transform group-hover:translate-y-0.5 ${prominent ? 'text-accent-ink' : 'text-dim group-hover:text-accent-text'}`}
          aria-hidden
        />
      </a>

      {file.sha256 && showChecksum && (
        <div className="border-t border-border/60 px-3 py-2">
          <Disclosure label={m.download_ui_file_details()}>
            <div className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-1.5">
                <IconHash size={12} stroke={2} className="shrink-0 text-dim" aria-hidden />
                <code className="truncate font-mono text-[0.68rem] text-dim">
                  {`${file.sha256.slice(0, 12)}…`}
                </code>
              </span>
              <CopyButton value={file.sha256} />
            </div>
          </Disclosure>
        </div>
      )}
    </div>
  );
}
