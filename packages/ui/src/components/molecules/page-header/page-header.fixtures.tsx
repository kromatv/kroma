import { Button } from '#ui/components/atoms/button';

import { Chip } from '#ui/components/atoms/chip';

import { PageHeader } from './page-header';

export function Parts() {
  return (
    <PageHeader.Root>
      <PageHeader.Title suffix="12">Users</PageHeader.Title>
      <PageHeader.Subtitle>Accounts and invitations</PageHeader.Subtitle>
      <PageHeader.Actions>
        <Chip variant="subtle" label="Live" />
        <Button variant="primary" size="sm" icon="plus" label="Invite" />
      </PageHeader.Actions>
    </PageHeader.Root>
  );
}

export function Glyph() {
  return (
    <PageHeader.Root>
      <PageHeader.Title icon="flame">Trending</PageHeader.Title>
      <PageHeader.Subtitle>What the world is watching this week</PageHeader.Subtitle>
    </PageHeader.Root>
  );
}
