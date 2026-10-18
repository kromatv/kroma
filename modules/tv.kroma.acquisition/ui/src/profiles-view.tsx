import { apiErrorText } from '@kromatv/client';
import { Table, type TableColumn, useAsyncAction, useT } from '@kromatv/module-sdk';
import { Badge, Box, Button, Callout, confirm, Menu, Row, Section, Text } from '@kromatv/ui/kit';
import { useState } from 'react';
import { useAcquisitionApi } from './api';
import { allowedQualities, copyOfProfile } from './profile-draft';
import { ProfileEditor } from './profile-editor';
import { RowMenuTrigger } from './row-menu-trigger';
import type { QualityProfile, RulesView } from './rules-schemas';
import { useQualityLabel } from './use-quality-label';

const COLUMNS: TableColumn[] = [{ min: 200 }, { width: 150, from: 'md' }, { width: 44 }];

interface Editing {
  profile: QualityProfile;
  isNew: boolean;
}

export function ProfilesView({
  rules,
  onSaved,
}: Readonly<{ rules: RulesView; onSaved: () => Promise<void> }>) {
  const t = useT();
  const acquisition = useAcquisitionApi();
  const [editing, setEditing] = useState<Editing | null>(null);
  const action = useAsyncAction();
  const fail = (e: unknown) => apiErrorText(e, t('requests.actionFailed'));
  const taken = rules.profiles.map((one) => one.id);

  const copyOf = (source: QualityProfile, name: string) =>
    setEditing({ profile: copyOfProfile(source, name, taken), isNew: true });

  const create = () => {
    const source =
      rules.profiles.find((one) => one.id === rules.defaultProfile) ?? rules.profiles[0];
    if (source) copyOf(source, t('acq.profileNewName'));
  };

  const makeDefault = (profile: QualityProfile) =>
    action.run(async () => {
      await acquisition.setDefaultProfile(profile.id);
      await onSaved();
    }, fail);

  const remove = async (profile: QualityProfile) => {
    const yes = await confirm({
      title: t('acq.profileDeleteTitle', { name: profile.name }),
      message: t('acq.profileDeleteHint'),
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
      destructive: true,
    });
    if (!yes) return;
    await action.run(async () => {
      await acquisition.deleteProfile(profile.id);
      await onSaved();
    }, fail);
  };

  return (
    <Box gap={16}>
      <Section.Root>
        <Section.Header>
          <Section.Title>{t('acq.tabProfiles')}</Section.Title>
          <Section.Actions>
            <Button size="sm" icon="plus" label={t('acq.profileNewTitle')} onPress={create} />
          </Section.Actions>
        </Section.Header>

        <Text variant="meta" color="textDim">
          {t('acq.profilesHint')}
        </Text>

        {action.error ? (
          <Callout.Root tone="danger">
            <Callout.Title>{action.error}</Callout.Title>
          </Callout.Root>
        ) : null}

        <Table.Root columns={COLUMNS} label={t('acq.tabProfiles')}>
          <Table.Header>
            <Table.Column>{t('acq.colProfile')}</Table.Column>
            <Table.Column>{t('acq.cutoff')}</Table.Column>
            <Table.Cell />
          </Table.Header>
          {rules.profiles.map((profile) => (
            <ProfileRow
              key={profile.id}
              profile={profile}
              isDefault={profile.id === rules.defaultProfile}
              busy={action.busy}
              onEdit={() => setEditing({ profile, isNew: false })}
              onDuplicate={() => copyOf(profile, t('acq.profileCopyName', { name: profile.name }))}
              onMakeDefault={() => makeDefault(profile)}
              onRemove={() => void remove(profile)}
            />
          ))}
        </Table.Root>
      </Section.Root>

      {editing ? (
        <ProfileEditor
          profile={editing.profile}
          isNew={editing.isNew}
          formats={rules.formats}
          onClose={() => setEditing(null)}
          onSaved={onSaved}
        />
      ) : null}
    </Box>
  );
}

function ProfileRow({
  profile,
  isDefault,
  busy,
  onEdit,
  onDuplicate,
  onMakeDefault,
  onRemove,
}: Readonly<{
  profile: QualityProfile;
  isDefault: boolean;
  busy: boolean;
  onEdit: () => void;
  onDuplicate: () => void;
  onMakeDefault: () => void;
  onRemove: () => void;
}>) {
  const t = useT();
  const label = useQualityLabel();
  const allowed = allowedQualities(profile);
  return (
    <Table.Row onPress={onEdit}>
      <Table.Cell>
        <Box minW={0}>
          <Row wrap gapX={10} gapY={4} align="center">
            <Text variant="meta" lines={1}>
              {profile.name}
            </Text>
            {isDefault ? <Badge tone="neutral">{t('acq.profileDefault')}</Badge> : null}
          </Row>
          <Text variant="meta" color="textDim">
            {t('acq.allowedCount', { count: allowed.length })}
            {profile.upgradesAllowed ? '' : ` · ${t('acq.upgradesOffShort')}`}
          </Text>
        </Box>
      </Table.Cell>
      <Table.Cell>
        <Text variant="meta" color="textDim" lines={1}>
          {label(profile.cutoff)}
        </Text>
      </Table.Cell>
      <Table.Cell>
        <Menu.Root label={t('acq.profileActionsOf', { name: profile.name })} align="end">
          <RowMenuTrigger label={t('acq.profileActionsOf', { name: profile.name })} />
          <Menu.Item icon="edit" onSelect={onEdit}>
            {t('acq.profileEdit')}
          </Menu.Item>
          <Menu.Item icon="copy" onSelect={onDuplicate}>
            {t('acq.profileDuplicate')}
          </Menu.Item>
          {isDefault ? null : (
            <Menu.Item icon="star" disabled={busy} onSelect={onMakeDefault}>
              {t('acq.profileMakeDefault')}
            </Menu.Item>
          )}
          {isDefault ? null : <Menu.Separator />}
          {isDefault ? null : (
            <Menu.Item icon="trash" tone="danger" disabled={busy} onSelect={onRemove}>
              {t('common.delete')}
            </Menu.Item>
          )}
        </Menu.Root>
      </Table.Cell>
    </Table.Row>
  );
}
