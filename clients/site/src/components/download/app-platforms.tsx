import {
  IconAlertTriangle,
  IconBrandAndroid,
  IconBrandApple,
  IconBrandDebian,
  IconBrandWindows,
  IconDeviceDesktop,
  IconDeviceGamepad2,
  IconDeviceMobile,
  IconDeviceTv,
  IconDeviceTvOld,
  IconInfoCircle,
  IconKey,
  IconRefresh,
  IconServer,
  IconWorld,
} from '@tabler/icons-react';
import { Callout } from '#site/components/download/callout';
import type { IconComponent } from '#site/components/download/icon';
import { docs, ProseLink } from '#site/components/download/links';
import {
  PlatformFamily,
  type PlatformFamilyProps,
} from '#site/components/download/platform-family';
import { Rich } from '#site/components/rich';
import { site } from '#site/lib/site';
import { m } from '#site/paraglide/messages';

// A link label is a message of its own: an anchor cannot live inside a
// plain-string message.
function note(
  icon: IconComponent,
  tag: string,
  body: string,
  link?: { href: string; label: string },
) {
  return (
    <Callout icon={icon} tag={tag}>
      <Rich>{body}</Rich>
      {link && (
        <>
          {' '}
          <ProseLink href={link.href}>{link.label}</ProseLink>
        </>
      )}
    </Callout>
  );
}

/** Every screen KROMA runs on, grouped by family. */
export function AppPlatforms() {
  const families: readonly PlatformFamilyProps[] = [
    {
      icon: IconDeviceTv,
      title: m.download_family_tv_title(),
      intro: m.download_family_tv_intro(),
      docHref: docs.installGuide,
      entries: [
        {
          icon: IconDeviceTv,
          name: 'Samsung (Tizen)',
          artifacts: ['.wgt'],
          setup: note(
            IconKey,
            m.download_family_tv_samsung_tag(),
            m.download_family_tv_samsung_body(),
          ),
          code: `sdb connect 192.168.1.50
tizen install -n KROMA.wgt -t <device-id>`,
        },
        {
          icon: IconDeviceTvOld,
          name: 'LG (webOS 4.0+)',
          artifacts: ['.ipk'],
          setup: note(IconKey, m.download_family_tv_lg_tag(), m.download_family_tv_lg_body()),
          code: `bun add -g @webos-tools/cli
ares-install tv.kroma.webos_*_all.ipk -d tv`,
        },
        {
          icon: IconBrandAndroid,
          name: 'Android TV / Google TV / Chromecast',
          artifacts: ['.apk'],
          setup: note(
            IconKey,
            m.download_family_tv_androidtv_tag(),
            m.download_family_tv_androidtv_body(),
          ),
          code: `adb connect 192.168.1.60:5555
adb install -r KROMA-androidtv.apk`,
        },
        {
          icon: IconBrandApple,
          name: 'Apple TV',
          beta: true,
          setup: note(
            IconInfoCircle,
            m.download_family_tv_appletv_tag(),
            m.download_family_tv_appletv_body(),
            { href: docs.beta, label: m.download_family_tv_appletv_link() },
          ),
        },
      ],
    },
    {
      icon: IconDeviceDesktop,
      title: m.download_family_desktop_title(),
      intro: m.download_family_desktop_intro(),
      docHref: docs.installGuide,
      entries: [
        {
          icon: IconBrandApple,
          name: 'macOS',
          artifacts: ['.dmg'],
          setup: note(
            IconAlertTriangle,
            m.download_family_desktop_mac_tag(),
            m.download_family_desktop_mac_body(),
          ),
          code: 'xattr -dr com.apple.quarantine /Applications/KROMA.app',
        },
        {
          icon: IconBrandWindows,
          name: 'Windows',
          artifacts: ['.exe', '.msi'],
          setup: note(
            IconAlertTriangle,
            m.download_family_desktop_win_tag(),
            m.download_family_desktop_win_body(),
          ),
        },
        {
          icon: IconBrandDebian,
          name: m.download_family_desktop_linux_name(),
          artifacts: ['.AppImage', '.deb'],
          setup: note(
            IconInfoCircle,
            m.download_family_desktop_linux_tag(),
            m.download_family_desktop_linux_body(),
          ),
          code: `chmod +x KROMA_*.AppImage && ./KROMA_*.AppImage
# .deb : sudo apt install ./KROMA_*.deb`,
        },
        {
          icon: IconDeviceGamepad2,
          name: 'Steam Deck',
          artifacts: ['.AppImage'],
          steps: [
            m.download_family_desktop_steamdeck_step_1(),
            m.download_family_desktop_steamdeck_step_2(),
            m.download_family_desktop_steamdeck_step_3(),
          ],
        },
      ],
    },
    {
      icon: IconDeviceMobile,
      title: m.download_family_mobile_title(),
      intro: m.download_family_mobile_intro(),
      docHref: docs.beta,
      entries: [
        {
          icon: IconBrandApple,
          name: 'iPhone / iPad',
          beta: true,
          setup: note(
            IconInfoCircle,
            m.download_family_mobile_ios_tag(),
            m.download_family_mobile_ios_body(),
            { href: docs.beta, label: m.download_family_mobile_ios_link() },
          ),
        },
        {
          icon: IconBrandAndroid,
          name: 'Android',
          beta: true,
          setup: note(
            IconInfoCircle,
            m.download_family_mobile_android_tag(),
            m.download_family_mobile_android_body(),
            { href: docs.beta, label: m.download_family_mobile_android_link() },
          ),
        },
      ],
    },
    {
      icon: IconServer,
      title: m.download_family_nas_title(),
      intro: m.download_family_nas_intro(),
      docHref: docs.installGuide,
      entries: [
        {
          icon: IconWorld,
          name: m.download_family_nas_web_name(),
          setup: note(
            IconInfoCircle,
            m.download_family_nas_web_tag(),
            m.download_family_nas_web_body(),
          ),
          code: 'http://nas.local:4040',
          codeLabel: 'url',
        },
        {
          icon: IconServer,
          name: 'Synology',
          artifacts: ['.spk'],
          setup: note(
            IconRefresh,
            m.download_family_nas_synology_tag(),
            m.download_family_nas_synology_body(),
          ),
          steps: [
            m.download_family_nas_synology_step_1(),
            m.download_family_nas_synology_step_2(),
            m.download_family_nas_synology_step_3(),
          ],
          code: site.packagesUrl,
          codeLabel: m.download_family_nas_source_label(),
          after: (
            <p className="mt-3 text-sm leading-relaxed text-dim">
              <Rich>{m.download_family_nas_manual()}</Rich>{' '}
              <ProseLink href={docs.releases}>{m.download_family_nas_manual_link()}</ProseLink>
            </p>
          ),
        },
      ],
    },
  ];

  return (
    <div className="space-y-14">
      {families.map((family) => (
        <PlatformFamily key={family.title} {...family} />
      ))}
    </div>
  );
}
