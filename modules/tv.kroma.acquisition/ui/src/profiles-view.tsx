import { apiErrorText } from '@kromatv/client';
import { Table, type TableColumn, useAsyncAction, useT } from '@kromatv/module-sdk';
import { Box, Button, Callout, confirm, Field, Row, Section, Text } from '@kromatv/ui/kit';
import { useState } from 'react';
import { useAcquisitionApi } from './api';
import { allowedQualities, copyOfProfile } from './profile-draft';
import { ProfileEditor } from './profile-editor';
import type { QualityProfile, RulesView } from './rules-schemas';

const COLUMNS: TableColumn[] = [{}, { width: 120, from: 'md' }, { width: 44 }, { width: 44 }];

export function ProfilesView({
  rules,
  onSaved,
}: Readonly<{ rules: RulesView; onSaved: () => Promise<void> }>) {
  const t = useT();
  const acquisition = useAcquisitionApi();
  const [editing, setEditing] = useState<QualityProfile | null>(null);
  const [newName, setNewName] = useState('');
  const action = useAsyncAction();
  const fail = (e: unknown) => apiErrorText(e, t('requests.actionFailed'));

  const create = () => {
    const source = rules.profiles.find((p) => p.id === rules.defaultProfile) ?? rules.profiles[0];
    if (!source || newName.trim() === '') return;
    setEditing(
      copyOfProfile(
        source,
        newName.trim(),
        rules.profiles.map((p) => p.id),
      ),
    );
    setNewName('');
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
            <Box w={200}>
              <Field.Root
                label={t('acq.profileNewName')}
                hideLabel
                size="sm"
                value={newName}
                onValueChange={setNewName}
              >
                <Field.Input placeholder={t('acq.profileNewName')} onSubmit={create} />
              </Field.Root>
            </Box>
            <Button
              size="sm"
              icon="plus"
              label={t('acq.profileNew')}
              disabled={newName.trim() === ''}
              onPress={create}
            />
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
            <Table.Cell />
          </Table.Header>
          {rules.profiles.map((profile) => (
            <ProfileRow
              key={profile.id}
              profile={profile}
              isDefault={profile.id === rules.defaultProfile}
              busy={action.busy}
              onEdit={() => setEditing(profile)}
              onMakeDefault={() => makeDefault(profile)}
              onRemove={() => void remove(profile)}
            />
          ))}
        </Table.Root>
      </Section.Root>

      {editing ? (
        <ProfileEditor
          profile={editing}
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
  onMakeDefault,
  onRemove,
}: Readonly<{
  profile: QualityProfile;
  isDefault: boolean;
  busy: boolean;
  onEdit: () => void;
  onMakeDefault: () => void;
  onRemove: () => void;
}>) {
  const t = useT();
  const allowed = allowedQualities(profile);
  return (
    <Table.Row onPress={onEdit}>
      <Table.Cell>
        <Box minW={0}>
          <Row wrap gapX={10} align="center">
            <Text variant="meta" lines={1}>
              {profile.name}
            </Text>
            {isDefault ? (
              <Text variant="meta" color="accentText">
                {t('acq.profileDefault')}
              </Text>
            ) : null}
          </Row>
          <Text variant="meta" color="textDim">
            {t('acq.allowedCount', { count: allowed.length })}
            {profile.upgradesAllowed ? '' : ` · ${t('acq.upgradesOffShort')}`}
          </Text>
        </Box>
      </Table.Cell>
      <Table.Cell>
        <Text variant="meta" color="textDim" lines={1}>
          {profile.cutoff}
        </Text>
      </Table.Cell>
      <Table.Cell>
        {isDefault ? null : (
          <Table.Action
            tone="accentText"
            icon="star"
            label={t('acq.profileMakeDefault')}
            disabled={busy}
            onPress={onMakeDefault}
          />
        )}
      </Table.Cell>
      <Table.Cell>
        {isDefault ? null : (
          <Table.Action
            tone="dangerHover"
            icon="trash"
            label={t('common.delete')}
            disabled={busy}
            onPress={onRemove}
          />
        )}
      </Table.Cell>
    </Table.Row>
  );
}
