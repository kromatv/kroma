import { IconArrowUpRight } from '@tabler/icons-react';
import { formatMoment } from '#site/lib/day';
import { useLang } from '#site/lib/i18n';
import { m } from '#site/paraglide/messages';
import { useDownloadChannel, useDownloadRelease } from '#site/components/download/channel';

export function ReleaseSummary() {
  const release = useDownloadRelease();
  const channel = useDownloadChannel();
  const lang = useLang();
  if (!release) return null;
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-xs text-dim">
      <span className="flex items-center gap-2">
        <span className="size-1.5 rounded-full bg-accent" aria-hidden />
        {channel === 'canary' ? m.download_channel_canary() : `v${release.version}`}
      </span>
      {release.publishedAt && (
        <time dateTime={release.publishedAt} className="hidden sm:inline">
          {formatMoment(release.publishedAt, lang)}
        </time>
      )}
      <span className="text-border-strong" aria-hidden>
        /
      </span>
      <a
        href={release.notesUrl}
        target="_blank"
        rel="noreferrer noopener"
        className="inline-flex items-center gap-1 text-muted transition-colors hover:text-accent-text"
      >
        {channel === 'canary' ? m.download_release_notes_canary() : m.download_release_notes()}
        <IconArrowUpRight size={12} aria-hidden />
      </a>
    </div>
  );
}
