import { Box, Button, Field, styles } from '@kroma/ui/kit';
import { useState } from 'react';
import { type Note, ProfileNote } from '#mobile/components/profile/ProfileNote';
import { useT } from '#mobile/lib/i18n';
import { useClient } from '#mobile/lib/session';
import { radius, spacing } from '#mobile/lib/theme';

export function PasswordForm() {
  const t = useT();
  const client = useClient();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordNote, setPasswordNote] = useState<Note>(null);

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

  return (
    <Box style={s.card}>
      <Field.Root label={t('account.currentPassword')} value={current} onValueChange={setCurrent}>
        <Field.Input icon="lock" type="password" />
      </Field.Root>
      <Field.Root label={t('account.newPassword')} value={next} onValueChange={setNext}>
        <Field.Input icon="lock" type="password" />
      </Field.Root>
      <Field.Root label={t('account.confirmPassword')} value={confirm} onValueChange={setConfirm}>
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
      <ProfileNote note={passwordNote} />
    </Box>
  );
}

const s = styles({
  card: { gap: 10, p: spacing.md, bg: 'surface1', radius: radius.lg, border: 'border' },
  submit: { mt: 4 },
});
