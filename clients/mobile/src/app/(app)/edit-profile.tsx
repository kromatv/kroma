import { LANG_OFF, langName } from '@kroma/core';
import { Box, styles } from '@kroma/ui/kit';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { type LangPickerRef, LangPickerSheet } from '#mobile/components/LangPickerSheet';
import { PageHeader } from '#mobile/components/PageHeader';
import { IdentityForm } from '#mobile/components/profile/IdentityForm';
import { PasswordForm } from '#mobile/components/profile/PasswordForm';
import { PrefRow } from '#mobile/components/profile/PrefRow';
import { ProfilePhoto } from '#mobile/components/profile/ProfilePhoto';
import { ProfileSection } from '#mobile/components/profile/ProfileSection';
import { Screen } from '#mobile/components/ui';
import { useT } from '#mobile/lib/i18n';
import { useLangPrefs } from '#mobile/lib/langPrefs';
import { boxed, contentWidth } from '#mobile/lib/layout';
import { useSession } from '#mobile/lib/session';
import { radius, spacing } from '#mobile/lib/theme';

export default function EditProfile() {
  const t = useT();
  const { user } = useSession();
  const { setAudio: setAudioPref, setSubtitle: setSubtitlePref } = useLangPrefs();

  const [picking, setPicking] = useState<'audio' | 'subtitle'>('audio');
  const sheet = useRef<LangPickerRef>(null);

  const langLabel = (value: string | null | undefined): string => {
    if (value === LANG_OFF) return t('player.subtitlesOff');
    if (!value) return t('account.noPreference');
    return langName(t, value) ?? value.toUpperCase();
  };

  // Through the shared hook, not a hand-rolled PATCH: the `none` sentinel is a
  // UI value and must never be stored.
  const savePref = (code: string | null) => {
    sheet.current?.dismiss();
    (picking === 'audio' ? setAudioPref : setSubtitlePref)(code);
  };

  const openPicker = (kind: 'audio' | 'subtitle') => {
    setPicking(kind);
    sheet.current?.present();
  };

  const pickedValue = picking === 'audio' ? user?.audioLanguage : user?.subtitleLanguage;

  return (
    <Screen padded={false}>
      <PageHeader title={t('account.title')} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
          <ProfilePhoto />

          <ProfileSection title={t('account.sectionInfo')}>
            <IdentityForm />
          </ProfileSection>

          <ProfileSection title={t('account.sectionPrefs')}>
            <Box style={s.rowCard}>
              <PrefRow
                icon="volume"
                label={t('account.audioLanguage')}
                value={langLabel(user?.audioLanguage)}
                onPress={() => openPicker('audio')}
              />
              <PrefRow
                icon="badge-cc"
                label={t('account.subtitleLanguage')}
                value={langLabel(user?.subtitleLanguage)}
                onPress={() => openPicker('subtitle')}
              />
            </Box>
          </ProfileSection>

          <ProfileSection title={t('account.sectionSecurity')}>
            <PasswordForm />
          </ProfileSection>
        </ScrollView>
      </KeyboardAvoidingView>

      <LangPickerSheet
        ref={sheet}
        title={picking === 'audio' ? t('account.audioLanguage') : t('account.subtitleLanguage')}
        value={pickedValue}
        offerOff={picking === 'subtitle'}
        onPick={savePref}
      />
    </Screen>
  );
}

const s = styles({
  body: { gap: spacing.lg, p: spacing.md, pb: spacing.xl * 2, ...boxed(contentWidth.form) },
  rowCard: { px: 6, py: 4, bg: 'surface1', radius: radius.lg, border: 'border' },
});
