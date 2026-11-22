import { useT } from '@kromatv/ui';
import { InputGroup } from '@kromatv/ui/kit';
import { useState } from 'react';
import { copyText } from '#web/shared/lib/copy-text';

const COPIED_MS = 1500;

/** A link the owner hands over by hand, in a field with its copy button. */
export function CopyableLink({ label, link }: Readonly<{ label: string; link: string }>) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (await copyText(link)) {
      setCopied(true);
      setTimeout(() => setCopied(false), COPIED_MS);
    }
  };
  return (
    <InputGroup.Root label={label}>
      <InputGroup.Input value={link} autoFocus={false} />
      <InputGroup.Addon align="inline-end">
        <InputGroup.Button
          icon="copy"
          label={copied ? t('common.copied') : t('common.copy')}
          onPress={() => void copy()}
        />
      </InputGroup.Addon>
    </InputGroup.Root>
  );
}
