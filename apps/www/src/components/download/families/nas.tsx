import { release } from 'virtual:kroma-releases';
import { site } from '@kroma/site-meta';
import { IconInfoCircle, IconRefresh, IconServer, IconWorld } from '@tabler/icons-react';
import { family } from '#site/components/download/families/meta';
import { docs, ProseLink } from '#site/components/download/links';
import { PlatformFamily } from '#site/components/download/platform-family';
import { Rich } from '#site/components/rich';
import { downloadsFor } from '#site/lib/releases';
import { m } from '#site/paraglide/messages';

export function NasFamily() {
  return (
    <PlatformFamily
      meta={family('nas')}
      intro={m.download_family_nas_intro()}
      docHref={docs.installGuide}
      entries={[
        {
          icon: IconWorld,
          name: m.download_family_nas_web_name(),
          note: {
            icon: IconInfoCircle,
            tag: m.download_family_nas_web_tag(),
            body: m.download_family_nas_web_body(),
          },
          install: { code: 'http://nas.local:4040', codeLabel: 'url' },
        },
        {
          icon: IconServer,
          name: 'Synology',
          downloads: downloadsFor(release, ['synology']),
          note: {
            icon: IconRefresh,
            tag: m.download_family_nas_synology_tag(),
            body: m.download_family_nas_synology_body(),
          },
          install: {
            label: m.download_ui_add_the_source(),
            steps: [
              m.download_family_nas_synology_step_1(),
              m.download_family_nas_synology_step_2(),
              m.download_family_nas_synology_step_3(),
            ],
            code: site.packagesUrl,
            codeLabel: m.download_family_nas_source_label(),
          },
          after: (
            <p className="mt-3 text-sm leading-relaxed text-dim">
              <Rich>{m.download_family_nas_manual()}</Rich>{' '}
              <ProseLink href={docs.releases}>{m.download_family_nas_manual_link()}</ProseLink>
            </p>
          ),
        },
      ]}
    />
  );
}
