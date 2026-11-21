import { apiErrorText } from '@kromatv/client';
import { MATURITY_LEVELS, type MaturityLevel } from '@kromatv/client/accounts';
import type { AdminUser } from '@kromatv/client/admin';
import type { Translate } from '@kromatv/i18n';
import { useT } from '@kromatv/ui';
import { Box, Button, Field, Row, Select, Text } from '@kromatv/ui/kit';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useAsyncAction } from '#web/features/admin/hooks';
import { useAuth } from '#web/shared/lib/auth';

/** A profile's maturity level in the member editor. It reads at once and
 * changes only after the admin types their own password, which then covers
 * every change for as long as the editor stays open (ACCT-116). The server
 * checks the password on each change. */
export function MaturityRestriction({ user }: Readonly<{ user: AdminUser }>) {
  const t = useT();
  const { client, user: me } = useAuth();
  const restrictions = useQuery({
    queryKey: restrictionsKey(user),
    queryFn: () => client.admin.restrictions.get(user.id),
  });
  const read = restrictions.data;
  const self = me?.id === user.id;
  return (
    <Box>
      <Text variant="overline" color="textDim" mb={8}>
        {t('admin.maturity')}
      </Text>
      {read ? <LevelControl user={user} level={read.level} locked={!read.held || self} /> : null}
      <Text variant="meta" color="textDim" mt={8}>
        {hintFor(t, { held: read?.held ?? true, self })}
      </Text>
    </Box>
  );
}

function restrictionsKey(user: AdminUser) {
  return ['admin', 'restrictions', user.id] as const;
}

function hintFor(t: Translate, { held, self }: { held: boolean; self: boolean }) {
  if (self) {
    return t('admin.maturitySelf');
  }
  return held ? t('admin.maturityHint') : t('admin.maturityRunsServer');
}

function useLevelChange(user: AdminUser) {
  const t = useT();
  const { client } = useAuth();
  const queryClient = useQueryClient();
  const [password, setPassword] = useState<string | null>(null);
  const { busy, error, run } = useAsyncAction();
  const apply = (next: MaturityLevel, proof: string) =>
    run(
      async () => {
        try {
          await client.admin.restrictions.setLevel(user.id, next, proof);
        } catch (refused) {
          setPassword(null);
          throw refused;
        }
        setPassword(proof);
        queryClient.setQueryData(restrictionsKey(user), { level: next, held: true });
      },
      (refused) => apiErrorText(refused, t('admin.maturityFailed')),
    );
  return { password, busy, error, apply };
}

function LevelControl({
  user,
  level,
  locked,
}: Readonly<{ user: AdminUser; level: MaturityLevel; locked: boolean }>) {
  const { password, busy, error, apply } = useLevelChange(user);
  if (password === null && !locked) {
    return <Unlock busy={busy} error={error} onConfirm={(proof) => void apply(level, proof)} />;
  }
  const pick = (next: MaturityLevel) => {
    if (password !== null) {
      void apply(next, password);
    }
  };
  return <LevelSelect level={level} disabled={locked || busy} onPick={pick} />;
}

function LevelSelect({
  level,
  disabled,
  onPick,
}: Readonly<{ level: MaturityLevel; disabled: boolean; onPick: (level: MaturityLevel) => void }>) {
  const t = useT();
  const picked = (value: string) => {
    const next = MATURITY_LEVELS.find((candidate) => String(candidate) === value);
    if (next !== undefined) {
      onPick(next);
    }
  };
  return (
    <Select.Root
      label={t('admin.maturity')}
      value={String(level)}
      disabled={disabled}
      onValueChange={picked}
    >
      <Select.Trigger />
      {MATURITY_LEVELS.map((candidate) => (
        <Select.Item
          key={candidate}
          value={String(candidate)}
          label={t(`content.maturity${candidate}`)}
        />
      ))}
    </Select.Root>
  );
}

function Unlock({
  busy,
  error,
  onConfirm,
}: Readonly<{ busy: boolean; error: string | null; onConfirm: (password: string) => void }>) {
  const t = useT();
  return (
    <Box>
      <Text variant="meta" color="textMuted" mb={8}>
        {t('admin.maturityPasswordHint')}
      </Text>
      <PasswordProof busy={busy} onConfirm={onConfirm} />
      {error ? (
        <Text variant="meta" color="danger" mt={8}>
          {error}
        </Text>
      ) : null}
    </Box>
  );
}

function PasswordProof({
  busy,
  onConfirm,
}: Readonly<{ busy: boolean; onConfirm: (password: string) => void }>) {
  const t = useT();
  const [typed, setTyped] = useState('');
  return (
    <Row gap={8} align="flex-end" wrap>
      <Box flex={1} minW={200}>
        <Field.Root label={t('admin.maturityPassword')}>
          <Field.Input
            type="password"
            icon="lock"
            value={typed}
            onValueChange={setTyped}
            onSubmit={() => onConfirm(typed)}
            autoComplete="current-password"
          />
        </Field.Root>
      </Box>
      <Button
        variant="glass"
        label={t('admin.maturityConfirm')}
        onPress={() => onConfirm(typed)}
        disabled={busy || typed.length === 0}
      />
    </Row>
  );
}
