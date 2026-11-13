import type { PublicUser } from '@kromatv/client/accounts';
import { useT } from '@kromatv/ui';
import { Box, Button, Callout, Field, Text } from '@kromatv/ui/kit';

/** What the screen has to say before anyone presses anything: why they are
 * here again, and what went wrong last time. */
export function Notices({
  notice,
  error,
}: Readonly<{ notice: string | null; error: string | null }>) {
  if (!(notice || error)) return null;
  return (
    <Box w="100%" gap={10}>
      {notice ? (
        <Callout.Root tone="accent" size="md" icon="info-circle">
          <Callout.Title>{notice}</Callout.Title>
        </Callout.Root>
      ) : null}
      {error ? (
        <Callout.Root tone="danger" size="md" icon="alert-circle">
          <Callout.Title>{error}</Callout.Title>
        </Callout.Root>
      ) : null}
    </Box>
  );
}

/** The quiet links under the form: open the password fields on a server that
 * hides them, and go back to the profiles. */
export function FormLinks({
  typing,
  canGoBack,
  busy,
  onType,
  onBack,
}: Readonly<{
  typing: boolean;
  canGoBack: boolean;
  busy: boolean;
  onType: () => void;
  onBack: () => void;
}>) {
  const t = useT();
  if (typing && !canGoBack) return null;
  return (
    <Box align="center" gap={4}>
      {typing ? null : (
        <Button
          variant="ghost"
          size="sm"
          label={t('auth.usePassword')}
          onPress={onType}
          disabled={busy}
        />
      )}
      {canGoBack ? (
        <Button
          variant="ghost"
          size="sm"
          icon="chevron-left"
          label={t('common.back')}
          onPress={onBack}
        />
      ) : null}
    </Box>
  );
}

/** The password form: who, the password, and its submit. `primary` gives the
 * submit the screen's main action; `focused` puts the caret in it on arrival. */
export function PasswordFields({
  profile,
  identifier,
  password,
  busy,
  primary,
  focused,
  restricted,
  onIdentifier,
  onPassword,
  onSubmit,
  onForgot,
}: Readonly<{
  profile: PublicUser | null;
  identifier: string;
  password: string;
  busy: boolean;
  primary: boolean;
  focused: boolean;
  restricted: boolean;
  onIdentifier: (value: string) => void;
  onPassword: (value: string) => void;
  onSubmit: () => void;
  onForgot?: () => void;
}>) {
  const t = useT();
  return (
    <Box w="100%" gap={12}>
      {profile ? null : (
        <Field.Root w="100%" size="md" label={t('auth.emailOrUsername')} hideLabel>
          <Field.Input
            icon="user"
            placeholder={t('auth.emailOrUsername')}
            value={identifier}
            onValueChange={onIdentifier}
            autoComplete="username"
            autoFocus={focused}
          />
        </Field.Root>
      )}
      <Field.Root w="100%" size="md" label={t('auth.password')} hideLabel>
        <Field.Input
          type="password"
          icon="lock"
          placeholder={t('auth.password')}
          value={password}
          onValueChange={onPassword}
          autoFocus={focused && Boolean(profile)}
        />
      </Field.Root>
      {restricted ? (
        <Text variant="meta" color="textMuted" textAlign="center">
          {t('auth.passwordOffHint')}
        </Text>
      ) : null}
      <Box mt={4} gap={6}>
        <Button
          block
          size="md"
          variant={primary ? 'primary' : 'glass'}
          label={busy ? t('auth.loggingIn') : t('auth.login')}
          loading={busy}
          disabled={busy || !password}
          onPress={onSubmit}
        />
        {onForgot ? (
          <Box align="center">
            <Button
              variant="ghost"
              size="sm"
              label={t('auth.forgotPassword')}
              onPress={onForgot}
              disabled={busy}
            />
          </Box>
        ) : null}
      </Box>
    </Box>
  );
}
