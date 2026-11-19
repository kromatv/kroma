import type { Permission } from '@kromatv/client/accounts';
import { PERMISSIONS } from '@kromatv/core';
import { useT } from '@kromatv/ui';
import { ChoiceList, Dialog, Text } from '@kromatv/ui/kit';
import { useState } from 'react';

interface RightsProps {
  rights: readonly Permission[];
  onClose: () => void;
  onSave: (next: Permission[]) => void;
}

interface ChoiceProps {
  picked: string[];
  onPick: (picked: string[]) => void;
}

function RightsChoice({ picked, onPick }: Readonly<ChoiceProps>) {
  const t = useT();
  return (
    <ChoiceList.Root
      mode="multiple"
      label={t('setup.peopleRightsEdit')}
      value={picked}
      onValueChange={onPick}
    >
      {PERMISSIONS.map((meta) => (
        <ChoiceList.Item key={meta.key} value={meta.key}>
          <ChoiceList.Label>{t(meta.labelKey)}</ChoiceList.Label>
          <ChoiceList.Hint>{t(meta.hintKey)}</ChoiceList.Hint>
        </ChoiceList.Item>
      ))}
    </ChoiceList.Root>
  );
}

/** What the account behind one invitation may do, for the owner to change. */
export function InvitationRights({ rights, onClose, onSave }: Readonly<RightsProps>) {
  const t = useT();
  const [picked, setPicked] = useState<string[]>([...rights]);
  const next = PERMISSIONS.map((meta) => meta.key).filter((key) => picked.includes(key));
  return (
    <Dialog.Root open title={t('setup.peopleRightsEdit')} width="md" onClose={onClose}>
      <RightsChoice picked={picked} onPick={setPicked} />
      <Text variant="meta" color="textDim">
        {t('setup.peopleRightsLink')}
      </Text>
      <Dialog.Footer>
        <Dialog.Actions
          onCancel={onClose}
          cancelLabel={t('common.cancel')}
          onConfirm={() => onSave(next)}
          confirmLabel={t('common.save')}
          disabled={next.length === 0}
        />
      </Dialog.Footer>
    </Dialog.Root>
  );
}
