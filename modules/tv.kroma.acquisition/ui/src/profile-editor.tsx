import { apiErrorText } from '@kromatv/client';
import { useAsyncAction, useT } from '@kromatv/module-sdk';
import { Box, Button, Callout, Dialog, Field, Row, SegmentGroup, Text } from '@kromatv/ui/kit';
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
  onClose,
  onSaved,
}: Readonly<{
  profile: QualityProfile;
  formats: readonly CustomFormat[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}>) {
  const t = useT();
  const acquisition = useAcquisitionApi();
  const [draft, setDraft] = useState(profile);
  const [tab, setTab] = useState<ProfileTab>('qualities');
  const action = useAsyncAction();

  const save = () =>
    action.run(
      async () => {
        await acquisition.saveProfile({ ...draft, name: draft.name.trim() });
        await onSaved();
        onClose();
      },
      (e) => apiErrorText(e, t('requests.actionFailed')),
    );

  return (
    <Dialog.Root open onClose={onClose} width="xl" title={t('acq.profileEdit')}>
      <Dialog.Header>
        <Text variant="title" accessibilityRole="header">
          {t('acq.profileEdit')}
        </Text>
        <Text variant="meta" color="textDim">
          {t('acq.profileEditHint')}
        </Text>
      </Dialog.Header>
      <Dialog.Panel>
        <Box gap={20}>
          {action.error ? (
            <Callout.Root tone="danger">
              <Callout.Title>{action.error}</Callout.Title>
            </Callout.Root>
          ) : null}

          <Row wrap between gap={16} align="flex-end">
            <Box w={280}>
              <Field.Root
                label={t('acq.profileName')}
                size="sm"
                value={draft.name}
                onValueChange={(name) => setDraft((d) => ({ ...d, name }))}
              >
                <Field.Input />
              </Field.Root>
            </Box>
            <SegmentGroup.Root
              value={tab}
              onValueChange={setTab}
              label={t('acq.profileSections')}
              size="sm"
            >
              {TABS.map((one) => (
                <SegmentGroup.Item key={one} value={one}>
                  <SegmentGroup.Label>{t(TAB_LABEL[one])}</SegmentGroup.Label>
                </SegmentGroup.Item>
              ))}
            </SegmentGroup.Root>
          </Row>

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
