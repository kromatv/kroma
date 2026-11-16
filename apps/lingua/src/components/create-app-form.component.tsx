import { Avatar } from '@kromatv/ui/kit/atoms/avatar';
import { Column, Row } from '@kromatv/ui/kit/atoms/box';
import { Button } from '@kromatv/ui/kit/atoms/button';
import { Text } from '@kromatv/ui/kit/atoms/text';
import { ChoiceList } from '@kromatv/ui/kit/molecules/choice-list';
import { Field } from '@kromatv/ui/kit/molecules/field';
import { useState } from 'react';
import { createApp } from '#site/lib/create-app';
import type { AppOwner } from '#site/lib/views';

const ANOTHER = '/another';

function CreateButton({
  onPress,
  disabled,
}: Readonly<{ onPress: () => void; disabled?: boolean }>) {
  return (
    <Row>
      <Button
        icon="brand-github"
        label="Create the GitHub App"
        disabled={disabled}
        onPress={onPress}
      />
    </Row>
  );
}

function OrganisationField({
  value,
  onValueChange,
  hint,
}: Readonly<{ value: string; onValueChange: (next: string) => void; hint: string }>) {
  return (
    <Field.Root label="Organisation" value={value} onValueChange={onValueChange} maxW={420}>
      <Field.Input placeholder="kromatv" physicalKeyboard />
      <Field.Hint>{hint}</Field.Hint>
    </Field.Root>
  );
}

function TypedOwner({ manifest }: Readonly<{ manifest: string }>) {
  const [organisation, setOrganisation] = useState('');
  return (
    <Column gap={16}>
      <OrganisationField
        value={organisation}
        onValueChange={setOrganisation}
        hint="Leave it empty to create the App under your own account."
      />
      <CreateButton onPress={() => createApp(manifest, organisation.trim() || null)} />
    </Column>
  );
}

function OwnerItem({ owner }: Readonly<{ owner: AppOwner }>) {
  const own = owner.kind === 'user';
  return (
    <ChoiceList.Item
      value={owner.login}
      actions={<Avatar name={owner.login} src={owner.avatarUrl} size={28} circle={own} />}
    >
      <ChoiceList.Label>{owner.login}</ChoiceList.Label>
      <ChoiceList.Hint>{own ? 'Your account' : 'An organisation you administer'}</ChoiceList.Hint>
    </ChoiceList.Item>
  );
}

function organisationOf(owners: readonly AppOwner[], picked: string | null): string | null {
  return (
    owners.find((owner) => owner.login === picked && owner.kind === 'organization')?.login ?? null
  );
}

function OwnerList({
  owners,
  picked,
  onPick,
}: Readonly<{
  owners: readonly AppOwner[];
  picked: string | null;
  onPick: (next: string) => void;
}>) {
  return (
    <ChoiceList.Root label="Where to create the GitHub App" value={picked} onValueChange={onPick}>
      {owners.map((owner) => (
        <OwnerItem key={owner.login} owner={owner} />
      ))}
      <ChoiceList.Item value={ANOTHER}>
        <ChoiceList.Label>Another organisation</ChoiceList.Label>
        <ChoiceList.Hint>One not listed here, such as a membership still pending</ChoiceList.Hint>
      </ChoiceList.Item>
    </ChoiceList.Root>
  );
}

function OwnerChoice({
  manifest,
  owners,
}: Readonly<{ manifest: string; owners: readonly AppOwner[] }>) {
  const [picked, setPicked] = useState<string | null>(owners[0]?.login ?? null);
  const [typed, setTyped] = useState('');
  const another = picked === ANOTHER;
  return (
    <Column gap={16}>
      <OwnerList owners={owners} picked={picked} onPick={setPicked} />
      {another ? (
        <OrganisationField
          value={typed}
          onValueChange={setTyped}
          hint="Only an owner of the organisation can create an App for it."
        />
      ) : null}
      <CreateButton
        disabled={another && typed.trim() === ''}
        onPress={() => createApp(manifest, another ? typed.trim() : organisationOf(owners, picked))}
      />
    </Column>
  );
}

function ChooseOwner() {
  return (
    <Column gap={12} align="flex-start">
      <Button
        icon="brand-github"
        label="Choose where to create the GitHub App"
        href="/auth/setup"
        role="link"
      />
      <Text variant="meta" color="textDim">
        GitHub asks you once to let Lingua read which organisations you belong to. Lingua keeps the
        list for an hour, and no token.
      </Text>
    </Column>
  );
}

/**
 * Step 1's form. With sign-in configured, GitHub lists where the operator may
 * create the App and they pick one; without it, they type an organisation.
 */
export function CreateAppForm({
  manifest,
  owners,
  signIn,
}: Readonly<{ manifest: string; owners: readonly AppOwner[]; signIn: boolean }>) {
  if (owners.length > 0) {
    return <OwnerChoice manifest={manifest} owners={owners} />;
  }
  return signIn ? <ChooseOwner /> : <TypedOwner manifest={manifest} />;
}
