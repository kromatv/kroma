import { IconArrowDown, IconDeviceLaptop } from '@tabler/icons-react';
import { useMemo, useSyncExternalStore } from 'react';
import { DownloadButton } from '#site/components/download/download-button';
import { fromDownload } from '#site/lib/build-file';
import { guessPlatform } from '#site/lib/platform';
import { downloadsFor } from '#site/lib/releases';
import { m } from '#site/paraglide/messages';
import { useDownloadRelease } from '#site/components/download/channel';

const subscribeNever = () => () => undefined;
const clientUserAgent = () => navigator.userAgent;
const serverUserAgent = () => '';

/**
 * The visitor's own build, offered before they scroll.
 *
 * Resolved after mount rather than during render: the page is prerendered once
 * for every reader, so there is no user agent to read at build time. Until then,
 * and for a device this cannot place, the section is absent and the platform
 * list below is the page's answer.
 */
export function YourPlatform() {
  const release = useDownloadRelease();
  const userAgent = useSyncExternalStore(subscribeNever, clientUserAgent, serverUserAgent);
  const guess = useMemo(() => (userAgent ? guessPlatform(userAgent) : null), [userAgent]);

  if (!guess || !release) return null;

  const files = downloadsFor(release, guess.targets).map(fromDownload);

  return (
    <div className="surface-hairline mt-10 rounded-2xl border border-accent/40 bg-accent-soft/40 p-5">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <IconDeviceLaptop size={17} stroke={1.75} className="text-accent-text" aria-hidden />
        <p className="font-display text-sm font-bold text-text">
          {m.download_yours_title({ platform: guess.label })}
        </p>
      </div>

      {files.length > 0 ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {files.map((file) => (
            <DownloadButton key={file.key} file={file} />
          ))}
        </div>
      ) : (
        <p className="mt-2 text-sm leading-relaxed text-muted">{m.download_yours_no_file()}</p>
      )}

      <a
        href={`#${guess.family}`}
        className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-accent-text transition-opacity hover:opacity-80"
      >
        {m.download_yours_jump()}
        <IconArrowDown size={14} stroke={2} aria-hidden />
      </a>
    </div>
  );
}
