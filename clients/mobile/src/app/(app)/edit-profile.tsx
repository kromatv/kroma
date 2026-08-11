import { KromaApiError, LANG_OFF, langName } from '@kroma/core';
import { Box, Button, Field, Icon, type IconName, Spinner, styles, Text } from '@kroma/ui/kit';
import * as ImagePicker from 'expo-image-picker';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView } from 'react-native';
import { Avatar } from '#mobile/components/Avatar';
import { type LangPickerRef, LangPickerSheet } from '#mobile/components/LangPickerSheet';
import { PageHeader } from '#mobile/components/PageHeader';
import { Screen } from '#mobile/components/ui';
import { useT } from '#mobile/lib/i18n';
import { useLangPrefs } from '#mobile/lib/langPrefs';
import { boxed, contentWidth } from '#mobile/lib/layout';
import { useClient, useSession } from '#mobile/lib/session';
import { radius, spacing, type } from '#mobile/lib/theme';

type Note = { text: string; ok: boolean } | null;

function Section({ title, children }: Readonly<{ title: string; children: React.ReactNode }>) {
  return (
    <Box style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      {children}
    </Box>
  );
}

function Message({ note }: Readonly<{ note: Note }>) {
  if (!note) return null;
  return <Text style={[s.message, note.ok ? s.messageOk : s.messageBad]}>{note.text}</Text>;
}

function PrefRow({
  icon,
  label,
  value,
  onPress,
}: Readonly<{ icon: IconName; label: string; value: string; onPress(): void }>) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [s.row, pressed && s.rowPressed]}
    >
      <Box style={s.rowIconLabel}>
        <Box style={s.rowIconBox}>
          <Icon name={icon} size={19} stroke={1.8} color="accentText" />
        </Box>
        {/* The label yields to an ellipsis, the value never does. */}
        <Text lines={1} style={s.rowLabel}>
          {label}
        </Text>
      </Box>
      <Box style={s.rowRight}>
        <Text lines={1} style={s.rowValue}>
          {value}
        </Text>
        <Icon name="selector" size={16} stroke={2} color="textDim" />
      </Box>
    </Pressable>
  );
}

export default function EditProfile() {
  const t = useT();
  const client = useClient();
  const { user, setUser } = useSession();
  const { setAudio: setAudioPref, setSubtitle: setSubtitlePref } = useLangPrefs();

  const [username, setUsername] = useState(user?.username ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [savingInfo, setSavingInfo] = useState(false);
  const [infoNote, setInfoNote] = useState<Note>(null);

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordNote, setPasswordNote] = useState<Note>(null);

  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarNote, setAvatarNote] = useState<Note>(null);

  const [picking, setPicking] = useState<'audio' | 'subtitle'>('audio');
  const sheet = useRef<LangPickerRef>(null);

  const avatar = client.resolveArt(user?.avatarUrl);

  const langLabel = (value: string | null | undefined): string => {
    if (value === LANG_OFF) return t('player.subtitlesOff');
    if (!value) return t('account.noPreference');
    return langName(t, value) ?? value.toUpperCase();
  };

  const pickPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });
    const asset = result.assets?.[0];
    if (result.canceled || !asset) return;
    setAvatarBusy(true);
    setAvatarNote(null);
    try {
      const blob = await (await fetch(asset.uri)).blob();
      const { avatarUrl } = await client.uploadAvatar(blob);
      if (user) setUser({ ...user, avatarUrl });
    } catch {
      setAvatarNote({ text: t('account.avatarFailed'), ok: false });
    } finally {
      setAvatarBusy(false);
    }
  };

  const saveInfo = async () => {
    setSavingInfo(true);
    setInfoNote(null);
    try {
      const { user: updated } = await client.updateAccount({
        username: username.trim(),
        email: email.trim(),
      });
      setUser(updated);
      setInfoNote({ text: t('account.profileSaved'), ok: true });
    } catch (err) {
      if (err instanceof KromaApiError && err.status === 409)
        setInfoNote({ text: t('auth.emailTaken'), ok: false });
      else setInfoNote({ text: t('account.saveFailed'), ok: false });
    } finally {
      setSavingInfo(false);
    }
  };

  // Through the shared hook, not a hand-rolled PATCH: the `none` sentinel is a
  // UI value and must never be stored.
  const savePref = (code: string | null) => {
    sheet.current?.dismiss();
    (picking === 'audio' ? setAudioPref : setSubtitlePref)(code);
  };

  const savePassword = async () => {
    if (next !== confirm) {
      setPasswordNote({ text: t('account.passwordMismatch'), ok: false });
      return;
    }
    setSavingPassword(true);
    setPasswordNote(null);
    try {
      await client.changePassword(current, next);
      setCurrent('');
      setNext('');
      setConfirm('');
      setPasswordNote({ text: t('account.profileSaved'), ok: true });
    } catch {
      setPasswordNote({ text: t('account.saveFailed'), ok: false });
    } finally {
      setSavingPassword(false);
    }
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
          <Box style={s.identity}>
            <Pressable
              onPress={() => void pickPhoto()}
              disabled={avatarBusy}
              accessibilityRole="button"
              accessibilityLabel={t('account.changePhoto')}
              style={({ pressed }) => [pressed && { opacity: 0.85 }]}
            >
              <Avatar uri={avatar} name={user?.username} size={104} />
              <Box style={s.editBadge}>
                {avatarBusy ? (
                  <Spinner size={14} thickness={2} color="accentInk" />
                ) : (
                  <Icon name="camera" size={14} stroke={2} color="accentInk" />
                )}
              </Box>
            </Pressable>
            <Text style={s.photoHint}>{t('account.photoHint')}</Text>
            <Message note={avatarNote} />
          </Box>

          <Section title={t('account.sectionInfo')}>
            <Box style={s.card}>
              <Field.Root label={t('auth.username')} value={username} onValueChange={setUsername}>
                <Field.Input icon="user" />
              </Field.Root>
              <Field.Root label={t('auth.email')} value={email} onValueChange={setEmail}>
                <Field.Input icon="mail" keyboardType="email-address" />
              </Field.Root>
              <Button
                label={t('common.save')}
                onPress={() => void saveInfo()}
                loading={savingInfo}
                disabled={!username.trim() || !email.trim()}
                style={s.submit}
              />
              <Message note={infoNote} />
            </Box>
          </Section>

          <Section title={t('account.sectionPrefs')}>
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
          </Section>

          <Section title={t('account.sectionSecurity')}>
            <Box style={s.card}>
              <Field.Root
                label={t('account.currentPassword')}
                value={current}
                onValueChange={setCurrent}
              >
                <Field.Input icon="lock" type="password" />
              </Field.Root>
              <Field.Root label={t('account.newPassword')} value={next} onValueChange={setNext}>
                <Field.Input icon="lock" type="password" />
              </Field.Root>
              <Field.Root
                label={t('account.confirmPassword')}
                value={confirm}
                onValueChange={setConfirm}
              >
                <Field.Input icon="lock" type="password" />
              </Field.Root>
              <Button
                variant="glass"
                label={t('account.updatePassword')}
                onPress={() => void savePassword()}
                loading={savingPassword}
                disabled={!current || next.length < 4}
                style={s.submit}
              />
              <Message note={passwordNote} />
            </Box>
          </Section>
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
  identity: { align: 'center', gap: spacing.xs, mt: spacing.xs },
  editBadge: {
    absolute: true,
    right: -2,
    bottom: -2,
    center: true,
    w: 30,
    h: 30,
    bg: 'accent',
    radius: 15,
    border: 'bg',
    borderWidth: 3,
  },
  photoHint: { ...type.small, mt: 2, textAlign: 'center' },
  section: { gap: spacing.xs },
  sectionTitle: { ...type.small, pl: 2, mb: 2, textTransform: 'uppercase', letterSpacing: 1 },
  card: { gap: 10, p: spacing.md, bg: 'surface1', radius: radius.lg, border: 'border' },
  rowCard: { px: 6, py: 4, bg: 'surface1', radius: radius.lg, border: 'border' },
  row: {
    row: true,
    between: true,
    align: 'center',
    gap: spacing.md,
    minH: 54,
    px: spacing.sm,
    radius: radius.md,
  },
  rowPressed: { bg: 'surface2' },
  rowIconLabel: { flex: true, row: true, align: 'center', gap: 12 },
  rowIconBox: { center: true, w: 34, h: 34, bg: 'accentSoft', radius: 10 },
  rowLabel: { ...type.body, shrink: 1, fontWeight: '500' },
  rowRight: { row: true, align: 'center', shrink: 0, gap: 8 },
  rowValue: { ...type.caption },
  submit: { mt: 4 },
  message: { ...type.caption, textAlign: 'center' },
  messageOk: { color: 'accentText' },
  messageBad: { color: 'danger' },
});
