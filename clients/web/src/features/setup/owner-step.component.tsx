import { apiErrorText } from '@kromatv/client';
import { isEmail, isPassword, isUsername } from '@kromatv/client/accounts';
import { useT } from '@kromatv/ui';
import { Box, Button, classes, Field, styles, useStyles } from '@kromatv/ui/kit';
import { type ReactNode, useState } from 'react';
import { StepActions, StepBody, StepHeading } from '#web/features/setup/setup-shell.component';
import { StepFailure } from '#web/features/setup/step-failure.component';
import { useAuth } from '#web/shared/lib/auth';

interface OwnerValues {
  username: string;
  email: string;
  password: string;
}

const EMPTY: OwnerValues = { username: '', email: '', password: '' };

interface OwnerStepProps {
  onBack: () => void;
  onCreated: () => void;
}

interface OwnerProfile {
  username: string;
  email: string;
}

interface OwnerReadyProps {
  owner: OwnerProfile;
  onBack: () => void;
  onContinue: () => void;
}

const sDefinition = styles({
  form: { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 },
});

function complete({ username, email, password }: OwnerValues): boolean {
  return isUsername(username) && isEmail(email) && isPassword(password);
}

function useOwnerAccount(onCreated: () => void) {
  const t = useT();
  const { register } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const create = async ({ username, email, password }: OwnerValues) => {
    setBusy(true);
    setError(null);
    try {
      await register(email.trim(), username.trim(), password);
      onCreated();
    } catch (cause) {
      setError(apiErrorText(cause, t('setup.ownerFailed')));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, create };
}

interface OwnerFieldsProps {
  values: OwnerValues;
  onChange: (values: OwnerValues) => void;
  onSubmit: () => void;
}

function PasswordField({ values, onChange, onSubmit }: Readonly<OwnerFieldsProps>) {
  const t = useT();
  return (
    <Field.Root size="md" label={t('setup.ownerPassword')}>
      <Field.Input
        type="password"
        icon="lock"
        autoComplete="new-password"
        value={values.password}
        onValueChange={(password) => onChange({ ...values, password })}
        onSubmit={onSubmit}
      />
      <Field.Hint>{t('setup.ownerPasswordHint')}</Field.Hint>
    </Field.Root>
  );
}

function OwnerFields({ values, onChange, onSubmit }: Readonly<OwnerFieldsProps>) {
  const t = useT();
  return (
    <Box gap={18}>
      <Field.Root size="md" label={t('setup.ownerName')}>
        <Field.Input
          icon="user"
          autoComplete="username"
          value={values.username}
          onValueChange={(username) => onChange({ ...values, username })}
          onSubmit={onSubmit}
        />
      </Field.Root>
      <Field.Root size="md" label={t('setup.ownerEmail')}>
        <Field.Input
          type="email"
          icon="mail"
          autoComplete="email"
          value={values.email}
          onValueChange={(email) => onChange({ ...values, email })}
          onSubmit={onSubmit}
        />
      </Field.Root>
      <PasswordField values={values} onChange={onChange} onSubmit={onSubmit} />
    </Box>
  );
}

function useOwnerProfile(onSaved: () => void) {
  const t = useT();
  const { client, updateUser } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async (profile: OwnerProfile) => {
    setBusy(true);
    setError(null);
    try {
      const { user } = await client.accounts.update({
        username: profile.username.trim(),
        email: profile.email.trim(),
      });
      updateUser(user);
      onSaved();
    } catch (cause) {
      setError(apiErrorText(cause, t('setup.ownerSaveFailed')));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, save };
}

function ProfileFields({
  profile,
  onChange,
}: Readonly<{ profile: OwnerProfile; onChange: (profile: OwnerProfile) => void }>) {
  const t = useT();
  return (
    <Box gap={18}>
      <Field.Root size="md" label={t('setup.ownerName')}>
        <Field.Input
          icon="user"
          autoComplete="username"
          value={profile.username}
          onValueChange={(username) => onChange({ ...profile, username })}
        />
      </Field.Root>
      <Field.Root size="md" label={t('setup.ownerEmail')}>
        <Field.Input
          type="email"
          icon="mail"
          autoComplete="email"
          value={profile.email}
          onValueChange={(email) => onChange({ ...profile, email })}
        />
        <Field.Hint>{t('setup.ownerPasswordLater')}</Field.Hint>
      </Field.Root>
    </Box>
  );
}

function OwnerReady({ owner, onBack, onContinue }: Readonly<OwnerReadyProps>) {
  const t = useT();
  const [profile, setProfile] = useState<OwnerProfile>(owner);
  const { busy, error, save } = useOwnerProfile(onContinue);
  const changed = profile.username !== owner.username || profile.email !== owner.email;
  const valid = isUsername(profile.username) && isEmail(profile.email);
  return (
    <>
      <StepHeading title={t('setup.ownerDoneTitle')} sub={t('setup.ownerDoneSub')} />
      <StepBody>
        <ProfileFields profile={profile} onChange={setProfile} />
        <StepFailure error={error} />
      </StepBody>
      <StepActions onBack={onBack}>
        <Button
          size="md"
          label={changed ? t('setup.ownerSave') : t('setup.continue')}
          iconRight="arrow-right"
          loading={busy}
          disabled={!valid}
          onPress={() => (changed ? void save(profile) : onContinue())}
        />
      </StepActions>
    </>
  );
}

/** The one screen nobody skips: the account that owns the server. Once that
 * account exists, the screen says so and asks nothing. */
export function OwnerStep({ onBack, onCreated }: Readonly<OwnerStepProps>) {
  const { user } = useAuth();
  if (user) {
    return <OwnerReady owner={user} onBack={onBack} onContinue={onCreated} />;
  }
  return <OwnerForm onBack={onBack} onCreated={onCreated} />;
}

function AccountForm({
  onSubmit,
  children,
}: Readonly<{ onSubmit: () => void; children: ReactNode }>) {
  const s = useStyles(sDefinition);
  return (
    <form
      className={classes(s.form)}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      {children}
    </form>
  );
}

function OwnerForm({ onBack, onCreated }: Readonly<OwnerStepProps>) {
  const t = useT();
  const [values, setValues] = useState(EMPTY);
  const { busy, error, create } = useOwnerAccount(onCreated);
  const submit = () => {
    if (complete(values) && !busy) {
      void create(values);
    }
  };
  return (
    <AccountForm onSubmit={submit}>
      <StepHeading title={t('setup.ownerTitle')} sub={t('setup.ownerSub')} />
      <StepBody>
        <OwnerFields values={values} onChange={setValues} onSubmit={submit} />
        <StepFailure error={error} />
      </StepBody>
      <StepActions onBack={onBack}>
        <Button
          size="md"
          label={busy ? t('setup.ownerCreating') : t('setup.ownerCreate')}
          loading={busy}
          disabled={!complete(values)}
          onPress={submit}
        />
      </StepActions>
    </AccountForm>
  );
}
