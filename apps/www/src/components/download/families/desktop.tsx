import { release } from 'virtual:kroma-releases';
import {
  IconAlertTriangle,
  IconBrandApple,
  IconBrandDebian,
  IconBrandWindows,
  IconDeviceGamepad2,
  IconInfoCircle,
} from '@tabler/icons-react';
import { family } from '#site/components/download/families/meta';
import { docs } from '#site/components/download/links';
import { PlatformFamily } from '#site/components/download/platform-family';
import { downloadsFor } from '#site/lib/releases';
import { m } from '#site/paraglide/messages';

export function DesktopFamily() {
  return (
    <PlatformFamily
      meta={family('desktop')}
      intro={m.download_family_desktop_intro()}
      docHref={docs.installGuide}
      entries={[
        {
          icon: IconBrandApple,
          name: 'macOS',
          downloads: downloadsFor(release, ['macos']),
        },
        {
          icon: IconBrandWindows,
          name: 'Windows',
          downloads: downloadsFor(release, ['windows-exe', 'windows-msi']),
          note: {
            icon: IconAlertTriangle,
            tag: m.download_family_desktop_win_tag(),
            body: m.download_family_desktop_win_body(),
          },
        },
        {
          icon: IconBrandDebian,
          name: m.download_family_desktop_linux_name(),
          downloads: downloadsFor(release, ['linux-appimage', 'linux-deb']),
          note: {
            icon: IconInfoCircle,
            tag: m.download_family_desktop_linux_tag(),
            body: m.download_family_desktop_linux_body(),
          },
          install: {
            label: m.download_ui_run_it(),
            code: `chmod +x KROMA_*.AppImage && ./KROMA_*.AppImage
# .deb : sudo apt install ./KROMA_*.deb`,
          },
        },
        {
          icon: IconDeviceGamepad2,
          name: 'Steam Deck',
          downloads: downloadsFor(release, ['linux-appimage']),
          install: {
            label: m.download_ui_add_to_steam(),
            steps: [
              m.download_family_desktop_steamdeck_step_1(),
              m.download_family_desktop_steamdeck_step_2(),
              m.download_family_desktop_steamdeck_step_3(),
            ],
          },
        },
      ]}
    />
  );
}
