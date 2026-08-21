import { release } from 'virtual:kroma-releases';
import {
  IconBrandAndroid,
  IconBrandApple,
  IconDeviceTv,
  IconDeviceTvOld,
  IconInfoCircle,
  IconKey,
} from '@tabler/icons-react';
import { family } from '#site/components/download/families/meta';
import { docs, join } from '#site/components/download/links';
import { PlatformFamily } from '#site/components/download/platform-family';
import { downloadsFor } from '#site/lib/releases';
import { m } from '#site/paraglide/messages';

export function TvFamily() {
  return (
    <PlatformFamily
      meta={family('tv')}
      intro={m.download_family_tv_intro()}
      docHref={docs.installGuide}
      entries={[
        {
          icon: IconDeviceTv,
          name: 'Samsung (Tizen)',
          downloads: downloadsFor(release, ['tizen']),
          note: {
            icon: IconKey,
            tag: m.download_family_tv_samsung_tag(),
            body: m.download_family_tv_samsung_body(),
          },
          install: {
            label: m.download_ui_sideload(),
            code: `sdb connect 192.168.1.50
tizen install -n KROMA-tizen-*.wgt -t <device-id>`,
          },
        },
        {
          icon: IconDeviceTvOld,
          name: 'LG (webOS 4.0+)',
          downloads: downloadsFor(release, ['webos']),
          note: {
            icon: IconKey,
            tag: m.download_family_tv_lg_tag(),
            body: m.download_family_tv_lg_body(),
          },
          install: {
            label: m.download_ui_sideload(),
            code: `bun add -g @webos-tools/cli
ares-install tv.kroma.webos_*_all.ipk -d tv`,
          },
        },
        {
          icon: IconBrandAndroid,
          name: 'Android TV / Google TV / Chromecast',
          downloads: downloadsFor(release, ['androidtv']),
          note: {
            icon: IconKey,
            tag: m.download_family_tv_androidtv_tag(),
            body: m.download_family_tv_androidtv_body(),
          },
          install: {
            label: m.download_ui_sideload(),
            code: `adb connect 192.168.1.60:5555
adb install -r KROMA-androidtv.apk`,
          },
        },
        {
          icon: IconBrandApple,
          name: 'Apple TV',
          beta: true,
          join: { href: join.testflight, channel: 'TestFlight' },
          note: {
            icon: IconInfoCircle,
            tag: m.download_family_tv_appletv_tag(),
            body: m.download_family_tv_appletv_body(),
          },
        },
      ]}
    />
  );
}
