import type { Locale, OfferedLocale, Translate } from '@kromatv/i18n';

export function localeLabel(t: Translate, locale: OfferedLocale<Locale>): string {
  const name = t(`lang.${locale.code}`);
  return locale.stage === 'beta' ? t('common.languageBeta', { name }) : name;
}
