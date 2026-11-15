import type { Locale, OfferedLocale, Translate } from '@kromatv/i18n';
import { describe, expect, it } from 'vitest';
import { localeLabel } from './locale-label';

const t = ((key: string, vars?: { name: string }) =>
  vars ? `${key}(${vars.name})` : key) as Translate;

const offered = (stage: OfferedLocale<Locale>['stage']): OfferedLocale<Locale> => ({
  code: 'en',
  labelKey: 'lang.en',
  stage,
});

describe('localeLabel', () => {
  it('names a stable language by its own label', () => {
    const label = localeLabel(t, offered('stable'));

    expect(label).toBe('lang.en');
  });

  it('marks a beta language', () => {
    const label = localeLabel(t, offered('beta'));

    expect(label).toBe('common.languageBeta(lang.en)');
  });
});
