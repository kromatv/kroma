import { IconBrandAndroid, IconBrandApple } from '@tabler/icons-react';
import { useState } from 'react';
import { AndroidBetaLink } from '#site/components/download/android-beta-link.component';
import { DevicePicker } from '#site/components/download/device-picker.component';
import { SamsungIcon } from '#site/components/download/samsung-icon.component';
import { LgIcon } from '#site/components/download/lg-icon.component';
import { family } from '#site/components/download/families/meta';
import { JoinButton } from '#site/components/download/join-button.component';
import { join } from '#site/components/download/links.component';
import { L } from '#site/components/localized-link';
import { PlatformDownload } from '#site/components/download/platform-download.component';
import { PlatformEntry } from '#site/components/download/platform-entry.component';
import { PlatformFamily } from '#site/components/download/platform-family.component';
import { StepList } from '#site/components/download/step-list.component';
import { m } from '#site/paraglide/messages';

export function TvFamily() {
  const [selected, setSelected] = useState('samsung');
  const options = [
    { id: 'samsung', name: 'Samsung', icon: SamsungIcon, logoOnly: true },
    { id: 'lg', name: 'LG', icon: LgIcon },
    { id: 'android', name: 'Android TV', icon: IconBrandAndroid },
    { id: 'apple', name: 'Apple TV', icon: IconBrandApple },
  ];
  return (
    <PlatformFamily
      meta={family('tv')}
      picker={
        <DevicePicker
          choices={options}
          selected={selected}
          onSelect={setSelected}
          label={m.download_tv_choice_label()}
          controls="tv-download"
        />
      }
    >
      {selected === 'samsung' && (
        <PlatformEntry
          icon={SamsungIcon}
          wideIcon
          name={m.download_tv_samsung_title()}
          badge="Tizen 6.0+"
          description={m.download_tv_samsung_body()}
          help={
            <div className="space-y-4">
              <StepList
                steps={[
                  m.download_tv_samsung_step_1(),
                  m.download_tv_samsung_step_2(),
                  m.download_tv_samsung_step_3(),
                ]}
              />
              <L
                to="/docs/samsung-tv"
                className="text-accent-text underline decoration-accent-text/40 underline-offset-2 hover:decoration-accent-text"
              >
                {m.download_tv_signing_guide()}
              </L>
            </div>
          }
        >
          <PlatformDownload target="tizen" label={m.download_for_chip({ chip: 'Samsung' })} />
          <PlatformDownload target="tizen-web" label={m.download_tv_samsung_older()} secondary />
        </PlatformEntry>
      )}
      {selected === 'lg' && (
        <PlatformEntry
          icon={LgIcon}
          name={m.download_tv_lg_title()}
          badge="webOS 4.0+"
          description={m.download_tv_lg_body()}
          help={
            <div className="space-y-4">
              <StepList
                steps={[
                  m.download_tv_lg_step_1(),
                  m.download_tv_lg_step_2(),
                  m.download_tv_lg_step_3(),
                ]}
              />
              <L
                to="/docs/lg-tv"
                className="text-accent-text underline decoration-accent-text/40 underline-offset-2 hover:decoration-accent-text"
              >
                {m.download_ui_detailed_steps()}
              </L>
            </div>
          }
        >
          <PlatformDownload target="webos" label={m.download_for_chip({ chip: 'LG' })} />
        </PlatformEntry>
      )}
      {selected === 'android' && (
        <PlatformEntry
          icon={IconBrandAndroid}
          name="Android TV"
          badge="Google Play · Google TV · Shield"
          description={m.download_tv_android_body()}
          help={
            <StepList
              steps={[
                m.download_tv_android_step_1(),
                m.download_tv_android_step_2(),
                m.download_tv_android_step_3(),
              ]}
            />
          }
        >
          <JoinButton
            href={join.playGroup}
            channel="Google Play"
            label={m.android_beta_join_group()}
          />
          <AndroidBetaLink />
        </PlatformEntry>
      )}
      {selected === 'apple' && (
        <PlatformEntry
          icon={IconBrandApple}
          name="Apple TV"
          badge="TestFlight"
          description={m.download_tv_apple_body()}
          help={
            <StepList
              steps={[
                m.download_tv_apple_step_1(),
                m.download_tv_apple_step_2(),
                m.download_tv_apple_step_3(),
              ]}
            />
          }
        >
          <JoinButton
            href={join.testflight}
            channel={m.download_tv_apple_action_hint()}
            label={m.download_join_testflight()}
          />
          <JoinButton
            href={join.testflightCanary}
            channel={m.download_tv_apple_action_hint()}
            label={m.download_join_testflight_canary()}
          />
        </PlatformEntry>
      )}
    </PlatformFamily>
  );
}
