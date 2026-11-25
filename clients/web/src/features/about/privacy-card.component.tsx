import { useT } from '@kromatv/ui';
import { Button } from '@kromatv/ui/kit';
import { OutsideLink } from '#web/shared/ui/outside-link.component';
import { SettingCard } from '#web/shared/ui/setting-card.component';

const POLICY = 'https://kroma.tv/privacy';

/** What KROMA collects, which is nothing, and the full policy. */
export function PrivacyCard() {
  const t = useT();
  return (
    <SettingCard
      icon="shield-lock"
      title={t('about.privacyTitle')}
      description={t('about.privacyBody')}
      footer={
        <Button
          variant="ghost"
          size="sm"
          icon="external-link"
          label={t('about.privacyRead')}
          asChild
        >
          <OutsideLink to={POLICY} />
        </Button>
      }
    />
  );
}
