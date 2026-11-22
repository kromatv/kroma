import { apiErrorText } from '@kromatv/client';
import type { NewKidsProfile } from '@kromatv/client/admin';
import type { LibraryId } from '@kromatv/client/media';
import { useT } from '@kromatv/ui';
import { ChoiceList, Dialog, Field, Text } from '@kromatv/ui/kit';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { createCallable } from 'react-call';
import { useAsyncAction } from '#web/features/admin/hooks';
import { LibraryVisibility } from '#web/features/admin/library-visibility.component';
import { KidsPinOffer } from '#web/features/admin/kids-pin-offer.component';
import { useAuth } from '#web/shared/lib/auth';

type KidsLevel = NewKidsProfile['level'];

const KIDS_LEVELS: readonly KidsLevel[] = [0, 7, 10];

/** Create a Kids profile (ACCT-122 to ACCT-124): a name, one of the kids levels
 * with none picked in advance, and the libraries it sees. It has no email and
 * no password. An admin with no profile PIN is then offered one, and taken to
 * it on their account page (ACCT-133).
 * Resolves `true` once created, `false` when dismissed. */
export const KidsModal = createCallable<void, boolean>(({ call }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [offering, setOffering] = useState(false);
  const done = () => call.end(true);
  if (offering) {
    const toPin = () => {
      done();
      void navigate({ to: '/account', search: { section: 'security', pin: 'set' } });
    };
    return <KidsPinOffer onSkip={done} onAccept={toPin} />;
  }
  return (
    <KidsDraft
      onCancel={() => call.end(false)}
      onCreated={() => (user?.hasPin ? done() : setOffering(true))}
    />
  );
});

function KidsDraft({
  onCancel,
  onCreated,
}: Readonly<{ onCancel: () => void; onCreated: () => void }>) {
  const t = useT();
  const draft = useKidsDraft(onCreated);
  return (
    <Dialog.Root open title={t('admin.addKids')} onClose={onCancel} width="lg">
      <Text variant="meta" color="textDim">
        {t('admin.kidsIntro')}
      </Text>
      <Field.Root label={t('admin.name')}>
        <Field.Input icon="user" value={draft.name} onValueChange={draft.setName} />
      </Field.Root>
      <KidsLevelChoice level={draft.level} onChange={draft.setLevel} />
      <LibraryVisibility granted={draft.granted} onChange={draft.setGranted} />
      {draft.error ? (
        <Text variant="meta" color="danger">
          {draft.error}
        </Text>
      ) : null}
      <KidsFooter
        busy={draft.busy}
        ready={draft.ready}
        onCancel={onCancel}
        onCreate={draft.submit}
      />
    </Dialog.Root>
  );
}

function useKidsDraft(onCreated: () => void) {
  const [name, setName] = useState('');
  const [level, setLevel] = useState<KidsLevel | null>(null);
  const [granted, setGranted] = useState<readonly LibraryId[] | null>(null);
  const { busy, error, create } = useCreateKids(onCreated);
  return {
    name,
    setName,
    level,
    setLevel,
    granted,
    setGranted,
    busy,
    error,
    ready: level !== null && name.trim() !== '',
    submit: () => void create({ name, level, granted }),
  };
}

function KidsFooter({
  busy,
  ready,
  onCancel,
  onCreate,
}: Readonly<{
  busy: boolean;
  ready: boolean;
  onCancel: () => void;
  onCreate: () => void;
}>) {
  const t = useT();
  return (
    <Dialog.Footer>
      <Dialog.Actions
        onCancel={onCancel}
        cancelLabel={t('common.cancel')}
        onConfirm={onCreate}
        confirmLabel={busy ? t('common.creating') : t('admin.addKidsConfirm')}
        busy={busy}
        disabled={!ready}
      />
    </Dialog.Footer>
  );
}

interface Draft {
  name: string;
  level: KidsLevel | null;
  granted: readonly LibraryId[] | null;
}

function useCreateKids(onCreated: () => void) {
  const t = useT();
  const { client } = useAuth();
  const { busy, error, run } = useAsyncAction();
  const create = ({ name, level, granted }: Draft) => {
    if (level === null) {
      return Promise.resolve();
    }
    const libraries = granted === null ? null : [...granted];
    return run(
      async () => {
        await client.admin.createKids({ username: name.trim(), level, libraries });
        onCreated();
      },
      (refused) => apiErrorText(refused, t('admin.kidsFailed')),
    );
  };
  return { busy, error, create };
}

function KidsLevelChoice({
  level,
  onChange,
}: Readonly<{ level: KidsLevel | null; onChange: (level: KidsLevel) => void }>) {
  const t = useT();
  const pick = (value: string) => {
    const next = KIDS_LEVELS.find((candidate) => String(candidate) === value);
    if (next !== undefined) {
      onChange(next);
    }
  };
  return (
    <ChoiceList.Root
      size="md"
      label={t('admin.maturity')}
      value={level === null ? '' : String(level)}
      onValueChange={pick}
    >
      {KIDS_LEVELS.map((candidate) => (
        <ChoiceList.Item key={candidate} value={String(candidate)}>
          <ChoiceList.Label>{t(`content.maturity${candidate}`)}</ChoiceList.Label>
          <ChoiceList.Hint>{t(`admin.kidsBand${candidate}`)}</ChoiceList.Hint>
        </ChoiceList.Item>
      ))}
    </ChoiceList.Root>
  );
}
