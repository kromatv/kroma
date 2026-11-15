import { IconArrowRight } from '@tabler/icons-react';
import { useDownloadChannel } from '#site/components/download/channel';
import { localizePath, useLang } from '#site/lib/i18n';
import { m } from '#site/paraglide/messages';

export function ArchiveLink() {
  const channel = useDownloadChannel();
  const lang = useLang();
  return (
    <a
      href={`${localizePath('/download/archive', lang)}${channel === 'canary' ? '?channel=canary' : ''}`}
      className="inline-flex items-center gap-2 text-sm font-medium text-accent-text hover:underline"
    >
      {m.download_archive_link()}
      <IconArrowRight size={15} aria-hidden />
    </a>
  );
}
