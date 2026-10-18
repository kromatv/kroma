import { apiErrorText } from '@kromatv/client';
import { useAsyncAction, useT } from '@kromatv/module-sdk';
import { Box, Button, Callout, Dialog, Field, SegmentGroup, Text, toast } from '@kromatv/ui/kit';
import { useState } from 'react';
import { useAcquisitionApi } from './api';
import { ProfileFormats } from './profile-formats';
import { ProfileRules } from './profile-rules';
import { ProfileTiers } from './profile-tiers';
import type { CustomFormat, QualityProfile } from './rules-schemas';

const TABS = ['qualities', 'formats', 'rules'] as const;
type ProfileTab = (typeof TABS)[number];

const TAB_LABEL: Record<ProfileTab, string> = {
  qualities: 'acq.profileQualities',
  formats: 'acq.tabFormats',
  rules: 'acq.profileRules',
};

export function ProfileEditor({
  profile,
  formats,
  isNew = false,
  onClose,
  onSaved,
}: Readonly<{
  profile: QualityProfile;
  formats: readonly CustomFormat[];
  /** No profile holds this id yet, so the dialog says so in its title. */
  isNew?: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}>) {
  const t = useT();
  const acquisition = useAcquisitionApi();
  const [draft, setDraft] = useState(profile);
  const [tab, setTab] = useState<ProfileTab>('qualities');
  const action = useAsyncAction();
  const heading = t(isNew ? 'acq.profileNewTitle' : 'acq.profileEdit');

  const save = () =>
    action.run(
      async () => {
        await acquisition.saveProfile({ ...draft, name: draft.name.trim() });
        await onSaved();
        toast({ message: t('acq.profileSaved', { name: draft.name.trim() }), tone: 'success' });
        onClose();
      },
      (e) => apiErrorText(e, t('requests.actionFailed')),
    );

  return (
    <Dialog.Root open onClose={onClose} width="lg" title={heading}>
      <Dialog.Header>
        <Text variant="title" accessibilityRole="header">
          {heading}
        </Text>
        <Text variant="meta" color="textDim">
          {t('acq.profileEditHint')}
        </Text>
        <SegmentGroup.Root
          value={tab}
          onValueChange={setTab}
          label={t('acq.profileSections')}
          size="sm"
          stretch
        >
          {TABS.map((one) => (
            <SegmentGroup.Item key={one} value={one}>
              <SegmentGroup.Label>{t(TAB_LABEL[one])}</SegmentGroup.Label>
            </SegmentGroup.Item>
          ))}
        </SegmentGroup.Root>
      </Dialog.Header>
      <Dialog.Panel>
        <Box gap={20}>
          {action.error ? (
            <Callout.Root tone="danger">
              <Callout.Title>{action.error}</Callout.Title>
            </Callout.Root>
          ) : null}

          <Field.Root
            label={t('acq.profileName')}
            size="sm"
            value={draft.name}
            invalid={draft.name.trim() === ''}
            onValueChange={(name) => setDraft((d) => ({ ...d, name }))}
          >
            <Field.Input />
          </Field.Root>

          <TabPanel tab={tab} draft={draft} formats={formats} onChange={setDraft} />
        </Box>
      </Dialog.Panel>
      <Dialog.Footer>
        <Dialog.Actions>
          <Button variant="ghost" label={t('common.cancel')} onPress={onClose} />
          <Button
            icon="check"
            label={t('common.save')}
            loading={action.busy}
            disabled={draft.name.trim() === ''}
            onPress={save}
          />
        </Dialog.Actions>
      </Dialog.Footer>
    </Dialog.Root>
  );
}

function TabPanel({
  tab,
  draft,
  formats,
  onChange,
}: Readonly<{
  tab: ProfileTab;
  draft: QualityProfile;
  formats: readonly CustomFormat[];
  onChange: (next: QualityProfile) => void;
}>) {
  switch (tab) {
    case 'qualities':
      return <ProfileTiers profile={draft} onChange={onChange} />;
    case 'formats':
      return <ProfileFormats profile={draft} formats={formats} onChange={onChange} />;
    case 'rules':
      return <ProfileRules profile={draft} onChange={onChange} />;
  }
}
