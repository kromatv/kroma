import { apiErrorText } from '@kromatv/client';
import { MATURITY_LEVELS, type MaturityLevel } from '@kromatv/client/accounts';
import type { AdminUser, Restrictions, TitleRule } from '@kromatv/client/admin';
import type { Translate } from '@kromatv/i18n';
import { useT } from '@kromatv/ui';
import { Box, Button, Field, Row, Select, Text } from '@kromatv/ui/kit';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useAsyncAction } from '#web/features/admin/hooks';
import { TitleRules } from '#web/features/admin/title-rules.component';
import { useAuth } from '#web/shared/lib/auth';

/** A profile's restrictions in the member editor: its maturity level and the
 * titles blocked or allowed for it. They read at once and change only after
 * the admin types their own password, which then covers every change for as
 * long as the editor stays open (ACCT-116, ACCT-121). The server checks the
 * password on each change. */
export function ProfileRestrictions({ user }: Readonly<{ user: AdminUser }>) {
  const t = useT();
  const { client, user: me } = useAuth();
  const restrictions = useQuery({
    queryKey: restrictionsKey(user),
    queryFn: () => client.admin.restrictions.get(user.id),
  });
  const change = useRestrictionChange(user);
  return (
    <Box>
      <Text variant="overline" color="textDim" mb={8}>
        {t('admin.maturity')}
      </Text>
      {restrictions.data ? (
        <RestrictionsBody read={restrictions.data} self={me?.id === user.id} change={change} />
      ) : null}
    </Box>
  );
}

function RestrictionsBody({
  read,
  self,
  change,
}: Readonly<{ read: Restrictions; self: boolean; change: RestrictionChange }>) {
  const t = useT();
  const locked = !read.held || self;
  return (
    <>
      <LevelControl level={read.level} locked={locked} change={change} />
      <Text variant="meta" color="textDim" mt={8}>
        {hintFor(t, { held: read.held, self })}
      </Text>
      {locked ? null : (
        <TitleRules
          titles={read.titles}
          onRule={change.password === null ? undefined : change.setRule}
        />
      )}
    </>
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

type RestrictionChange = ReturnType<typeof useRestrictionChange>;

function useRestrictionChange(user: AdminUser) {
  const t = useT();
  const { client } = useAuth();
  const queryClient = useQueryClient();
  const [password, setPassword] = useState<string | null>(null);
  const { busy, error, run } = useAsyncAction();
  const proven = (proof: string, write: () => Promise<void>) =>
    run(
      async () => {
        try {
          await write();
        } catch (refused) {
          setPassword(null);
          throw refused;
        }
        setPassword(proof);
        await queryClient.invalidateQueries({ queryKey: restrictionsKey(user) });
      },
      (refused) => apiErrorText(refused, t('admin.maturityFailed')),
    );
  const setLevel = (level: MaturityLevel, proof = password ?? '') =>
    proven(proof, () => client.admin.restrictions.setLevel(user.id, level, proof));
  const setRule = (title: string, rule: TitleRule | null) =>
    void proven(password ?? '', () =>
      client.admin.restrictions.setTitleRule(user.id, { title, rule }, password ?? ''),
    );
  return { password, busy, error, setLevel, setRule };
}

function LevelControl({
  level,
  locked,
  change,
}: Readonly<{ level: MaturityLevel; locked: boolean; change: RestrictionChange }>) {
  if (change.password === null && !locked) {
    return (
      <Unlock
        busy={change.busy}
        error={change.error}
        onConfirm={(proof) => void change.setLevel(level, proof)}
      />
    );
  }
  return (
    <LevelSelect
      level={level}
      disabled={locked || change.busy}
      onPick={(next) => void change.setLevel(next)}
    />
  );
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
