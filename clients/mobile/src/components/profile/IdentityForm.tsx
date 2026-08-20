import { KromaApiError } from '@kroma/core';
import { Box, Button, Field, styles } from '@kroma/ui/kit';
import { useState } from 'react';
import { type Note, ProfileNote } from '#mobile/components/profile/ProfileNote';
import { useT } from '#mobile/lib/i18n';
import { useClient, useSession } from '#mobile/lib/session';
import { radius, spacing } from '#mobile/lib/theme';

export function IdentityForm() {
  const t = useT();
  const client = useClient();
  const { user, setUser } = useSession();
  const [username, setUsername] = useState(user?.username ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [savingInfo, setSavingInfo] = useState(false);
  const [infoNote, setInfoNote] = useState<Note>(null);

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

  return (
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
      <ProfileNote note={infoNote} />
    </Box>
  );
}

const s = styles({
  card: { gap: 10, p: spacing.md, bg: 'surface1', radius: radius.lg, border: 'border' },
  submit: { mt: 4 },
});
