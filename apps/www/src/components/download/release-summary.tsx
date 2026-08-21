import { release } from 'virtual:kroma-releases';
import { IconArrowUpRight, IconTag } from '@tabler/icons-react';
import { formatMoment } from '#site/lib/day';
import { useLang } from '#site/lib/i18n';
import { m } from '#site/paraglide/messages';

/**
 * Which release the buttons on this page hand over. Renders nothing when no
 * release was baked in, which off a production build means dev.
 */
export function ReleaseSummary() {
  const lang = useLang();
  if (!release) return null;

  return (
    <div className="mt-8">
      <p className="font-sans text-xs font-bold uppercase tracking-wider text-dim">
        {m.download_release_eyebrow()}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <span className="inline-flex items-center gap-2.5 rounded-full border border-border bg-surface-1/60 py-1.5 pl-3 pr-4">
          <IconTag size={15} stroke={1.75} className="shrink-0 text-accent-text" aria-hidden />
          <span className="font-mono font-medium text-text">{release.version}</span>
          {release.publishedAt && (
            <time dateTime={release.publishedAt} className="text-xs tabular-nums text-dim">
              {formatMoment(release.publishedAt, lang)}
            </time>
          )}
        </span>
        <a
          href={release.notesUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1 font-medium text-accent-text transition-opacity hover:opacity-80"
        >
          {m.download_release_notes()}
          <IconArrowUpRight size={14} stroke={2} aria-hidden />
        </a>
      </div>
    </div>
  );
}
