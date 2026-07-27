// Edit profile: photo, personal information, preferred playback languages and
// password, all synced to the account (same PATCH /auth/me + avatar upload as
// the web client).
//
// The photo is the avatar itself - the same tappable identity block as the
// profile tab, with the badge as the affordance - and the language choices are
// two rows opening a bottom sheet rather than two walls of chips: eight
// options twice over pushed the security section a screen and a half down.
// The sheet they open is <LangPickerSheet>, which offers every language rather
// than the seven this screen used to hardcode.

import { KromaApiError, LANG_OFF, langName } from '@kroma/core';
import { Button, Icon, type IconName, Spinner } from '@kroma/ui/kit';
import * as ImagePicker from 'expo-image-picker';
import { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Avatar } from '#mobile/components/Avatar';
import { type LangPickerRef, LangPickerSheet } from '#mobile/components/LangPickerSheet';
import { PageHeader } from '#mobile/components/PageHeader';
import { Screen, TextField } from '#mobile/components/ui';
import { useT } from '#mobile/lib/i18n';
import { useLangPrefs } from '#mobile/lib/langPrefs';
import { boxed, contentWidth } from '#mobile/lib/layout';
import { useClient, useSession } from '#mobile/lib/session';
import { colors, radius, spacing, type } from '#mobile/lib/theme';

/** A save's outcome, shown in place: amber for done, red for refused. */
type Note = { text: string; ok: boolean } | null;

function Section({ title, children }: Readonly<{ title: string; children: React.ReactNode }>) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Message({ note }: Readonly<{ note: Note }>) {
  if (!note) return null;
  return (
    <Text style={[styles.message, { color: note.ok ? colors.accent : colors.danger }]}>
      {note.text}
    </Text>
  );
}

/** A preference row: glyph well, label, the current choice, and the selector
 * mark that says "picks in place" (the profile tab's chevron-right means "goes
 * somewhere"; this opens a sheet). */
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
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={styles.rowIconLabel}>
        <View style={styles.rowIconBox}>
          <Icon name={icon} size={19} stroke={1.8} color={colors.accent} />
        </View>
        {/* The label yields, the value does not: "Langue des sous-titres
            préférée" can lose its tail to an ellipsis, but a choice squeezed
            to "Franç…" reads as broken. */}
        <Text numberOfLines={1} style={styles.rowLabel}>
          {label}
        </Text>
      </View>
      <View style={styles.rowRight}>
        <Text numberOfLines={1} style={styles.rowValue}>
          {value}
        </Text>
        <Icon name="selector" size={16} stroke={2} color={colors.textFaint} />
      </View>
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

  /** Which preference the sheet is picking for. It also keys the sheet's
   * title, so one sheet serves both rows. */
  const [picking, setPicking] = useState<'audio' | 'subtitle'>('audio');
  const sheet = useRef<LangPickerRef>(null);

  const avatar = client.resolveArt(user?.avatarUrl);

  /** The row's reading of a stored track language - the dub VARIANT included,
   * because that is the choice that was made: a viewer who picked the VFQ track
   * reads "Français (Canada)" here, not a "Français" that hides which of the two
   * dubs the next title will open on. */
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

  // Through the shared hook, not a hand-rolled PATCH: it normalizes the picked
  // code (the `none` sentinel is a UI value and must never be stored, and a dub
  // region has to survive), updates the local user optimistically so the row
  // changes on tap rather than after the round-trip, and drops a no-op write.
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
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {/* The photo IS the control, like the profile tab's identity block -
              the badge is the affordance, and it spins while the upload runs. */}
          <View style={styles.identity}>
            <Pressable
              onPress={() => void pickPhoto()}
              disabled={avatarBusy}
              accessibilityRole="button"
              accessibilityLabel={t('account.changePhoto')}
              style={({ pressed }) => [pressed && { opacity: 0.85 }]}
            >
              <Avatar uri={avatar} name={user?.username} size={104} />
              <View style={styles.editBadge}>
                {avatarBusy ? (
                  <Spinner size={14} thickness={2} color={colors.accentInk} />
                ) : (
                  <Icon name="camera" size={14} stroke={2} color={colors.accentInk} />
                )}
              </View>
            </Pressable>
            <Text style={styles.photoHint}>{t('account.photoHint')}</Text>
            <Message note={avatarNote} />
          </View>

          <Section title={t('account.sectionInfo')}>
            <View style={styles.card}>
              <Text style={styles.fieldLabel}>{t('auth.username')}</Text>
              <TextField icon="user" value={username} onChangeText={setUsername} />
              <Text style={styles.fieldLabel}>{t('auth.email')}</Text>
              <TextField
                icon="mail"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
              />
              <Button
                label={t('common.save')}
                onPress={() => void saveInfo()}
                loading={savingInfo}
                disabled={!username.trim() || !email.trim()}
                style={styles.submit}
              />
              <Message note={infoNote} />
            </View>
          </Section>

          <Section title={t('account.sectionPrefs')}>
            <View style={styles.rowCard}>
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
            </View>
          </Section>

          <Section title={t('account.sectionSecurity')}>
            <View style={styles.card}>
              <Text style={styles.fieldLabel}>{t('account.currentPassword')}</Text>
              <TextField icon="lock" value={current} onChangeText={setCurrent} secureTextEntry />
              <Text style={styles.fieldLabel}>{t('account.newPassword')}</Text>
              <TextField icon="lock" value={next} onChangeText={setNext} secureTextEntry />
              <Text style={styles.fieldLabel}>{t('account.confirmPassword')}</Text>
              <TextField icon="lock" value={confirm} onChangeText={setConfirm} secureTextEntry />
              <Button
                variant="glass"
                label={t('account.updatePassword')}
                onPress={() => void savePassword()}
                loading={savingPassword}
                disabled={!current || next.length < 4}
                style={styles.submit}
              />
              <Message note={passwordNote} />
            </View>
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

const styles = StyleSheet.create({
  body: {
    padding: spacing.md,
    paddingBottom: spacing.xl * 2,
    gap: spacing.lg,
    ...boxed(contentWidth.form),
  },
  identity: { alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
  editBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.bg,
  },
  photoHint: { ...type.small, textAlign: 'center', marginTop: 2 },
  section: { gap: spacing.xs },
  sectionTitle: {
    ...type.small,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 2,
    paddingLeft: 2,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 10,
  },
  /** The rows carry their own padding, so their card holds them edge to edge
   * the way the profile tab's does. */
  rowCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 54,
    paddingHorizontal: spacing.sm,
    gap: spacing.md,
    borderRadius: radius.md,
  },
  rowPressed: { backgroundColor: colors.surfaceRaised },
  rowIconLabel: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  rowIconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: { ...type.body, fontWeight: '500', flexShrink: 1 },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
  rowValue: { ...type.caption },
  fieldLabel: { ...type.caption, marginTop: 2 },
  submit: { marginTop: 4 },
  message: { ...type.caption, textAlign: 'center' },
});
