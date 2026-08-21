import { release } from 'virtual:kroma-releases';
import { IconBrandAndroid, IconBrandApple } from '@tabler/icons-react';
import { family } from '#site/components/download/families/meta';
import { docs, join } from '#site/components/download/links';
import { PlatformFamily } from '#site/components/download/platform-family';
import { downloadsFor } from '#site/lib/releases';
import { m } from '#site/paraglide/messages';

/**
 * iOS has no file here: the release carries an App Store `.ipa`, which nobody
 * who downloads it can install.
 */
export function MobileFamily() {
  return (
    <PlatformFamily
      meta={family('mobile')}
      intro={m.download_family_mobile_intro()}
      docHref={docs.beta}
      entries={[
        {
          icon: IconBrandApple,
          name: 'iPhone / iPad',
          beta: true,
          join: { href: join.testflight, channel: 'TestFlight' },
        },
        {
          icon: IconBrandAndroid,
          name: 'Android',
          beta: true,
          downloads: downloadsFor(release, ['android']),
          join: { href: join.firebase, channel: 'Firebase App Distribution' },
        },
      ]}
    />
  );
}
