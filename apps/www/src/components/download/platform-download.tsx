import { ArchiveLink } from '#site/components/download/archive-link';
import { useDownloadRelease } from '#site/components/download/channel';
import { DownloadButton } from '#site/components/download/download-button';
import { fromDownload } from '#site/lib/build-file';
import { TARGETS, type TargetId } from '#site/lib/release-targets';
import { megabytes } from '#site/lib/releases';
import { m } from '#site/paraglide/messages';

/** One clearly labeled installer per device, with an honest unavailable state. */
export function PlatformDownload({ target, label }: Readonly<{ target: TargetId; label: string }>) {
  const release = useDownloadRelease();
  const download = release?.downloads.find((file) => file.target === target);
  if (!download)
    return (
      <div className="space-y-2 rounded-xl border border-dashed border-border p-3">
        <p className="text-sm text-muted">
          {m.download_unavailable({ platform: TARGETS[target].label })}
        </p>
        <ArchiveLink />
      </div>
    );
  return (
    <DownloadButton
      file={{
        ...fromDownload(download),
        meta: `${TARGETS[target].ext} · ${megabytes(download.bytes)}`,
      }}
      label={label}
      prominent
      showChecksum={false}
    />
  );
}
