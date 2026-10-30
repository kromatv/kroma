import { IconBrandAndroid, IconBrandApple } from '@tabler/icons-react';
import { useState, useSyncExternalStore } from 'react';
import { AndroidBetaLink } from '#site/components/download/android-beta-link';
import { DevicePicker } from '#site/components/download/device-picker';
import { family } from '#site/components/download/families/meta';
import { JoinButton } from '#site/components/download/join-button';
import { join } from '#site/components/download/links';
import { PlatformEntry } from '#site/components/download/platform-entry';
import { PlatformFamily } from '#site/components/download/platform-family';
import { StepList } from '#site/components/download/step-list';
import { m } from '#site/paraglide/messages';

const subscribeNever = () => () => undefined;
const clientDevice = () => (/android/i.test(navigator.userAgent) ? 'android' : 'apple');
const serverDevice = () => 'apple';

export function MobileFamily() {
  const detected = useSyncExternalStore(subscribeNever, clientDevice, serverDevice);
  const [chosen, setChosen] = useState<string | null>(null);
  const selected = chosen ?? detected;
  const choices = [
    { id: 'apple', name: 'iPhone & iPad', icon: IconBrandApple },
    { id: 'android', name: 'Android', icon: IconBrandAndroid },
  ];
  return (
    <PlatformFamily
      meta={family('mobile')}
      picker={
        <DevicePicker
          choices={choices}
          selected={selected}
          onSelect={setChosen}
          label={m.download_mobile_choice_label()}
          controls="mobile-download"
        />
      }
    >
      {selected === 'apple' ? (
        <PlatformEntry
          icon={IconBrandApple}
          name="iPhone & iPad"
          badge={`${m.download_ui_beta()} · TestFlight`}
          description={m.download_mobile_apple_body()}
          help={
            <StepList
              steps={[
                m.download_mobile_apple_step_1(),
                m.download_mobile_apple_step_2(),
                m.download_mobile_apple_step_3(),
              ]}
            />
          }
        >
          <JoinButton
            href={join.testflight}
            channel="TestFlight"
            label={m.download_join_testflight()}
          />
        </PlatformEntry>
      ) : (
        <PlatformEntry
          icon={IconBrandAndroid}
          name="Android"
          badge={`${m.download_ui_beta()} · Google Play`}
          description={m.download_mobile_android_body()}
          help={
            <StepList
              steps={[
                m.download_mobile_android_step_1(),
                m.download_mobile_android_step_2(),
                m.download_mobile_android_step_3(),
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
    </PlatformFamily>
  );
}
