import { LinuxIcon } from '#site/components/download/linux-icon';
import { IconBrandApple, IconBrandWindows } from '@tabler/icons-react';
import { useDownloadRelease } from '#site/components/download/channel';
import { DownloadButton } from '#site/components/download/download-button';
import { PlatformEntry } from '#site/components/download/platform-entry';
import { docs } from '#site/components/download/links';
import { fromDownload } from '#site/lib/build-file';
import { megabytes } from '#site/lib/releases';
import { TARGETS, type TargetId } from '#site/lib/release-targets';
import { m } from '#site/paraglide/messages';

export function DesktopFamily({
  platform = 'macos',
}: Readonly<{ platform?: 'macos' | 'windows' | 'linux' }>) {
  const release = useDownloadRelease();
  const computers = {
    macos: {
      icon: IconBrandApple,
      name: 'macOS',
      targets: ['macos', 'macos-intel'],
      help: m.download_mac_help(),
    },
    windows: {
      icon: IconBrandWindows,
      name: 'Windows',
      targets: ['windows-exe', 'windows-msi'],
      help: m.download_windows_help(),
    },
    linux: {
      icon: LinuxIcon,
      name: 'Linux',
      targets: ['linux-appimage', 'linux-deb'],
      help: m.download_linux_help(),
    },
  } as const;
  const computer = computers[platform];
  return (
    <PlatformEntry
      id="desktop"
      heading="h2"
      icon={computer.icon}
      name={computer.name}
      description={m.download_desktop_installer()}
      note={m.download_desktop_note()}
      help={
        <div>
          <p className="text-sm leading-relaxed text-muted">{computer.help}</p>
          <a
            href={docs.installGuide}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-2 inline-block text-sm text-accent-text"
          >
            {m.download_ui_detailed_steps()} →
          </a>
        </div>
      }
    >
      {computer.targets.map((target: TargetId) => {
        const download = release?.downloads.find((file) => file.target === target);
        const label =
          target === 'macos' || target === 'macos-intel'
            ? TARGETS[target].arch!
            : TARGETS[target].ext;
        return download ? (
          <DownloadButton
            key={target}
            file={{
              ...fromDownload(download),
              meta: `${TARGETS[target].ext} · ${megabytes(download.bytes)}`,
            }}
            label={
              platform === 'macos'
                ? m.download_for_chip({ chip: label })
                : `${m.download_ui_download()} ${label}`
            }
            prominent={target === computer.targets[0]}
            showChecksum={false}
          />
        ) : (
          <p
            key={target}
            className="rounded-xl border border-dashed border-border p-3 text-sm text-dim"
          >
            {m.download_unavailable({ platform: label })}
          </p>
        );
      })}
    </PlatformEntry>
  );
}
