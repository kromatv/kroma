import { site } from '@kromatv/site-meta';
import { IconBrandDocker, IconServer, IconWorld } from '@tabler/icons-react';
import { useState } from 'react';
import { CodeBlock } from '#site/components/download/code-block';
import { DevicePicker } from '#site/components/download/device-picker';
import { DockerPanel } from '#site/components/download/families/docker';
import { family } from '#site/components/download/families/meta';
import { PlatformDownload } from '#site/components/download/platform-download';
import { PlatformEntry } from '#site/components/download/platform-entry';
import { PlatformFamily } from '#site/components/download/platform-family';
import { ServerAddressForm } from '#site/components/download/server-address-form';
import { StepList } from '#site/components/download/step-list';
import { m } from '#site/paraglide/messages';

export function NasFamily() {
  const [selected, setSelected] = useState('docker');
  const choices = [
    { id: 'docker', name: 'Docker', icon: IconBrandDocker },
    { id: 'synology', name: 'Synology NAS', icon: IconServer },
    { id: 'browser', name: m.download_family_nas_web_name(), icon: IconWorld },
  ];
  return (
    <PlatformFamily
      meta={family('nas')}
      picker={
        <DevicePicker
          choices={choices}
          selected={selected}
          onSelect={setSelected}
          label={m.download_nas_choice_label()}
          controls="nas-download"
        />
      }
    >
      {selected === 'docker' && <DockerPanel />}
      {selected === 'synology' && (
        <PlatformEntry
          icon={IconServer}
          name={m.download_synology_title()}
          badge="DSM 7 · x86-64"
          description={m.download_nas_synology_body()}
          help={
            <div className="space-y-5">
              <StepList
                steps={[
                  m.download_server_synology_step_1(),
                  m.download_server_synology_step_2(),
                  m.download_server_synology_step_3(),
                ]}
              />
              <details>
                <summary className="cursor-pointer text-sm font-medium text-accent-text">
                  {m.download_nas_auto_updates()}
                </summary>
                <div className="mt-4 space-y-4">
                  <StepList
                    steps={[
                      m.download_family_nas_synology_step_1(),
                      m.download_family_nas_synology_step_2(),
                      m.download_family_nas_synology_step_3(),
                    ]}
                  />
                  <CodeBlock code={site.packagesUrl} label={m.download_family_nas_source_label()} />
                </div>
              </details>
            </div>
          }
        >
          <PlatformDownload target="synology" label={m.download_synology_package()} />
        </PlatformEntry>
      )}
      {selected === 'browser' && (
        <PlatformEntry
          icon={IconWorld}
          name={m.download_in_browser()}
          badge={m.download_family_nas_web_tag()}
          description={m.download_nas_browser_body()}
        >
          <ServerAddressForm />
        </PlatformEntry>
      )}
      {selected !== 'docker' && (
        <p className="border-t border-border/60 px-5 py-4 text-xs leading-relaxed text-muted sm:px-9 lg:px-10">
          {m.download_nas_other_body()}{' '}
          <button
            type="button"
            onClick={() => setSelected('docker')}
            className="font-medium text-accent-text hover:underline"
          >
            {m.download_nas_other_link()} →
          </button>
        </p>
      )}
    </PlatformFamily>
  );
}
