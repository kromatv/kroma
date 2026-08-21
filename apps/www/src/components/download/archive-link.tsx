import { canary, releases } from 'virtual:kroma-releases';
import { IconArrowRight, IconHistory } from '@tabler/icons-react';
import { L } from '#site/components/localized-link';
import { m } from '#site/paraglide/messages';

/**
 * The way into the archive from the install page.
 *
 * Carries its own counts, so the link says how much is behind it rather than
 * asking a reader to follow it to find out. Absent when the build baked in no
 * history, which off a production build means dev.
 */
export function ArchiveLink() {
  if (releases.length === 0 && canary.length === 0) return null;

  return (
    <L
      to="/download/archive"
      className="group mt-8 flex items-center gap-4 rounded-xl border border-border bg-surface-1/50 px-4 py-3.5 transition-colors hover:border-accent hover:bg-accent-soft"
    >
      <IconHistory
        size={20}
        stroke={1.75}
        className="shrink-0 text-muted transition-colors group-hover:text-accent-text"
        aria-hidden
      />

      <span className="flex min-w-0 flex-col leading-tight">
        <span className="font-sans text-sm font-semibold text-text">
          {m.download_archive_link()}
        </span>
        <span className="mt-0.5 font-sans text-xs text-dim">
          {m.download_archive_detail({
            releases: String(releases.length),
            canary: String(canary.length),
          })}
        </span>
      </span>

      <IconArrowRight
        size={16}
        stroke={2}
        className="ml-auto shrink-0 text-dim transition-all group-hover:translate-x-0.5 group-hover:text-accent-text"
        aria-hidden
      />
    </L>
  );
}
