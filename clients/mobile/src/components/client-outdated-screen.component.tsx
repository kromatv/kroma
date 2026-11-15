import { Text } from '@kromatv/ui/kit';
import {
  OnboardingBox,
  OnboardingScreen,
  OnboardingTitle,
} from '#mobile/components/onboarding-screen.component';
import { buildInfo } from '#mobile/lib/build-info';
import { useT } from '#mobile/lib/i18n';

/** The one screen an app too old for its server shows, in place of the tabs. */
export function ClientOutdatedScreen({ server }: Readonly<{ server: string }>) {
  const t = useT();
  return (
    <OnboardingScreen settings={false}>
      <OnboardingBox>
        <OnboardingTitle
          title={t('compat.clientOutdatedTitle')}
          subtitle={t('compat.clientOutdated', { client: buildInfo.version, server })}
        />
        <Text variant="body" color="textDim" textAlign="center">
          {t('compat.howToUpdateMobile')}
        </Text>
      </OnboardingBox>
    </OnboardingScreen>
  );
}
