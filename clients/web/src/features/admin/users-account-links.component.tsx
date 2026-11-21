import type { ResetCreated, VerificationCreated } from '@kromatv/client/accounts';
import type { AdminUser } from '@kromatv/client/admin';
import { useT } from '@kromatv/ui';
import {
  Box,
  Button,
  Callout,
  Icon,
  ListRow,
  Row,
  resolveStyles,
  styles,
  Text,
  useConfirm,
  useStyleScope,
  useThemeVersion,
} from '@kromatv/ui/kit';
import { useState } from 'react';
import { useAsyncAction } from '#web/features/admin/hooks';
import { useAuth } from '#web/shared/lib/auth';
import { LinkResult } from '#web/features/admin/users-link-result.component';

const sDefinition = styles({
  code: { fontFamily: 'monospace', letterSpacing: 4 },
});

function ActionError({ error }: Readonly<{ error: string | null }>) {
  if (!error) {
    return null;
  }
  return (
    <Text variant="meta" color="danger" mt={8}>
      {error}
    </Text>
  );
}

function SectionTitle({ children }: Readonly<{ children: string }>) {
  return (
    <Text variant="overline" color="textDim" mb={8}>
      {children}
    </Text>
  );
}

function useVerification(user: AdminUser) {
  const t = useT();
  const { client } = useAuth();
  const action = useAsyncAction();
  const [verification, setVerification] = useState<VerificationCreated | null>(null);
  const send = () =>
    action.run(
      async () => setVerification(await client.admin.sendEmailVerification(user.id)),
      () => t('admin.verificationFailed'),
    );
  return { ...action, verification, send };
}

interface AddressRowProps {
  user: AdminUser;
  busy: boolean;
  onSend: () => void;
}

function AddressRow({ user, busy, onSend }: Readonly<AddressRowProps>) {
  const t = useT();
  return (
    <ListRow.Root size="md">
      <ListRow.Leading>
        <Icon name="mail" size={18} thickness={1.8} color="textDim" />
      </ListRow.Leading>
      <ListRow.Label>{user.email}</ListRow.Label>
      <ListRow.Hint>
        {user.emailVerified ? t('admin.emailVerified') : t('admin.emailUnverified')}
      </ListRow.Hint>
      <ListRow.Trailing>
        <Button
          variant="glass"
          size="sm"
          label={t('admin.sendVerification')}
          onPress={onSend}
          disabled={busy}
        />
      </ListRow.Trailing>
    </ListRow.Root>
  );
}

function SentVerification({ verification }: Readonly<{ verification: VerificationCreated }>) {
  const t = useT();
  return (
    <Callout.Root tone="accent">
      <Callout.Title>{t('admin.verificationLink')}</Callout.Title>
      <LinkResult
        kind="verify"
        label={t('admin.verificationLink')}
        url={verification.url}
        token={verification.token}
        delivered={verification.delivered}
      />
    </Callout.Root>
  );
}

function EmailVerification({ user }: Readonly<{ user: AdminUser }>) {
  const t = useT();
  const { busy, error, verification, send } = useVerification(user);
  return (
    <Box>
      <SectionTitle>{t('admin.email')}</SectionTitle>
      <AddressRow user={user} busy={busy} onSend={() => void send()} />
      <ActionError error={error} />
      {verification ? <SentVerification verification={verification} /> : null}
    </Box>
  );
}

function MintedReset({ reset }: Readonly<{ reset: ResetCreated }>) {
  const t = useT();
  const scope = useStyleScope();
  useThemeVersion();
  return (
    <Callout.Root tone="accent">
      <Callout.Title>{t('admin.resetCode')}</Callout.Title>
      <Text variant="heading" textAlign="center" style={resolveStyles(sDefinition, scope).code}>
        {reset.code}
      </Text>
      <Text variant="meta" color="textMuted">
        {t('admin.resetCodeHint')}
      </Text>
      <LinkResult
        kind="reset"
        label={t('admin.resetLink')}
        url={reset.url}
        token={reset.token}
        delivered={reset.delivered}
        code={reset.code}
      />
    </Callout.Root>
  );
}

type Run = ReturnType<typeof useAsyncAction>['run'];

function useResetAccess(user: AdminUser, run: Run) {
  const t = useT();
  const confirm = useConfirm();
  const { client } = useAuth();
  const [reset, setReset] = useState<ResetCreated | null>(null);
  const resetAccess = async () => {
    const ok = await confirm({
      title: t('admin.resetAccess'),
      message: t('admin.resetUserConfirm', { name: user.username }),
      confirmLabel: t('admin.resetAccess'),
      cancelLabel: t('common.cancel'),
    });
    if (ok) {
      await run(
        async () => setReset(await client.admin.resetUser(user.id)),
        () => t('admin.resetAccessFailed'),
      );
    }
  };
  return { reset, resetAccess };
}

function useClearPin(user: AdminUser, run: Run) {
  const t = useT();
  const confirm = useConfirm();
  const { client } = useAuth();
  const [pinCleared, setPinCleared] = useState(false);
  const clear = async () => {
    await client.admin.clearUserPin(user.id);
    setPinCleared(true);
  };
  const clearPin = async () => {
    const ok = await confirm({
      title: t('admin.clearPin'),
      message: t('admin.confirmClearPin', { name: user.username }),
      confirmLabel: t('admin.clearPin'),
      cancelLabel: t('common.cancel'),
      destructive: true,
    });
    if (ok) {
      await run(clear, () => t('admin.updateFailed'));
    }
  };
  return { pinCleared, clearPin };
}

function ResetRequested() {
  const t = useT();
  return (
    <Box mb={12}>
      <Callout.Root tone="accent" size="sm" icon="info-circle">
        <Callout.Title>{t('admin.resetRequested')}</Callout.Title>
        <Callout.Detail>{t('admin.resetRequestedHint')}</Callout.Detail>
      </Callout.Root>
    </Box>
  );
}

interface AccessButtonsProps {
  user: AdminUser;
  busy: boolean;
  pinCleared: boolean;
  onReset: () => void;
  onClearPin: () => void;
}

function AccessButtons({
  user,
  busy,
  pinCleared,
  onReset,
  onClearPin,
}: Readonly<AccessButtonsProps>) {
  const t = useT();
  return (
    <Row gap={8} wrap>
      <Button
        variant="glass"
        size="sm"
        icon="key"
        label={t('admin.resetAccess')}
        onPress={onReset}
        disabled={busy}
      />
      <Button
        variant="glass"
        size="sm"
        icon="lock"
        label={pinCleared ? t('admin.pinCleared') : t('admin.clearPin')}
        onPress={onClearPin}
        disabled={busy || pinCleared || !user.hasPin}
      />
    </Row>
  );
}

function AccessRecovery({ user }: Readonly<{ user: AdminUser }>) {
  const t = useT();
  const { busy, error, run } = useAsyncAction();
  const { reset, resetAccess } = useResetAccess(user, run);
  const { pinCleared, clearPin } = useClearPin(user, run);
  return (
    <Box>
      <SectionTitle>{t('admin.accessSection')}</SectionTitle>
      {user.resetRequested ? <ResetRequested /> : null}
      <AccessButtons
        user={user}
        busy={busy}
        pinCleared={pinCleared}
        onReset={() => void resetAccess()}
        onClearPin={() => void clearPin()}
      />
      <Text variant="meta" color="textDim" mt={8}>
        {t('admin.resetAccessHint')}
      </Text>
      <ActionError error={error} />
      {reset ? <MintedReset reset={reset} /> : null}
    </Box>
  );
}

/** What the owner mints for an account its person holds: a check of its
 * address, and a way back in for a person who is locked out. */
export function AccountLinks({ user }: Readonly<{ user: AdminUser }>) {
  return (
    <>
      <EmailVerification user={user} />
      <AccessRecovery user={user} />
    </>
  );
}
