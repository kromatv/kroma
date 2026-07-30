// The sign-in and registration forms used by the login gate. Split out of
// `AuthGate.tsx`, which owns the gate/routing + profile picker and composes
// these two screens.

import { TextInput } from '@kroma/admin-kit';
import { isEmail, isPassword, isUsername, type PublicUser } from '@kroma/core';
import { useT } from '@kroma/ui';
import { Button } from '@kroma/ui/kit';
import { IconInfoCircle } from '@tabler/icons-react';
import { useState } from 'react';
import { RegisterFields, type RegisterValues } from '#web/features/accounts/auth-fields';
import { UserAvatar } from '#web/features/accounts/user-avatar';

export function LoginForm({
  profile,
  busy,
  error,
  notice = null,
  canGoBack = true,
  canUsePasskey = false,
  onBack,
  onSubmit,
  onPasskey,
}: Readonly<{
  profile: PublicUser | null;
  busy: boolean;
  error: string | null;
  notice?: string | null;
  canGoBack?: boolean;
  canUsePasskey?: boolean;
  onBack: () => void;
  onSubmit: (identifier: string, password: string) => void;
  onPasskey?: () => void;
}>) {
  const t = useT();
  const [identifier, setIdentifier] = useState(profile?.username ?? '');
  const [password, setPassword] = useState('');

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (identifier.trim() && password) onSubmit(identifier.trim(), password);
      }}
      className="flex w-full max-w-95 flex-col items-center gap-5"
    >
      {profile ? (
        <UserAvatar
          name={profile.username}
          avatarUrl={profile.avatarUrl}
          seed={profile.id}
          size={96}
        />
      ) : null}
      <h1 className="font-display text-[28px] font-semibold">
        {profile ? profile.username : t('auth.signinTitle')}
      </h1>

      {notice ? (
        <div className="flex w-full items-center gap-2.5 rounded-md border border-accent/25 bg-accent-soft px-3.5 py-2.5 text-[13.5px] font-medium text-accent">
          <IconInfoCircle size={17} stroke={1.9} className="flex-none" />
          <span>{notice}</span>
        </div>
      ) : null}

      {profile ? null : (
        <TextInput
          size="lg"
          className="w-full"
          placeholder={t('auth.emailOrUsername')}
          autoComplete="username"
          value={identifier}
          onChange={setIdentifier}
          // Deliberate: the sign-in field is what this screen is for.
          autoFocus
        />
      )}
      <TextInput
        size="lg"
        className="w-full"
        type="password"
        placeholder={t('auth.password')}
        autoComplete="current-password"
        value={password}
        onChange={setPassword}
        // Deliberate: with a profile already picked, the password is the only thing left to type.
        autoFocus={Boolean(profile)}
      />

      {error ? <p className="text-[13px] font-medium text-danger">{error}</p> : null}

      <button
        type="submit"
        disabled={busy || !password}
        className="mt-1 w-full rounded-md bg-accent py-3.5 text-[15px] font-bold text-accent-ink transition-colors hover:bg-accent-hover disabled:opacity-50"
      >
        {busy ? t('auth.loggingIn') : t('auth.login')}
      </button>
      {canUsePasskey && onPasskey ? (
        <Button
          block
          variant="glass"
          icon="key"
          label={t('auth.passkeyLogin')}
          onPress={() => onPasskey()}
          disabled={busy}
        />
      ) : null}
      {canGoBack ? (
        <Button
          variant="ghost"
          size="sm"
          icon="chevron-left"
          label={t('common.back')}
          onPress={onBack}
        />
      ) : null}
    </form>
  );
}

export function RegisterForm({
  busy,
  error,
  canGoBack,
  onBack,
  onSubmit,
}: Readonly<{
  busy: boolean;
  error: string | null;
  canGoBack: boolean;
  onBack: () => void;
  onSubmit: (email: string, username: string, password: string, avatar: File | null) => void;
}>) {
  const t = useT();
  const [values, setValues] = useState<RegisterValues>({ email: '', username: '', password: '' });
  const [avatar, setAvatar] = useState<File | null>(null);
  const { email, username, password } = values;

  // Shared field rules (mirrors the server), so client + every app validate alike.
  const valid = isEmail(email) && isUsername(username) && isPassword(password);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onSubmit(email.trim(), username.trim(), password, avatar);
      }}
      className="flex w-full max-w-95 flex-col items-center gap-5"
    >
      <h1 className="font-display text-[28px] font-semibold">{t('auth.newAccount')}</h1>

      <RegisterFields values={values} onChange={setValues} onAvatar={setAvatar} />

      {error ? <p className="text-[13px] font-medium text-danger">{error}</p> : null}

      <Button
        block
        label={busy ? t('auth.creating') : t('auth.createAccount')}
        onPress={() => {
          if (valid) onSubmit(email.trim(), username.trim(), password, avatar);
        }}
        loading={busy}
        disabled={!valid}
      />
      {canGoBack ? (
        <Button
          variant="ghost"
          size="sm"
          icon="chevron-left"
          label={t('common.back')}
          onPress={onBack}
        />
      ) : null}
    </form>
  );
}
