import type { ImportSignIn } from '@kromatv/client/importers';
import { useT } from '@kromatv/ui';
import { Callout } from '@kromatv/ui/kit';
import { REFUSAL_LINE } from '#web/features/admin/import/import-words';

/** Why the other server turned the sign-in down, in the owner's words. It
 * draws nothing for any other answer. */
export function ImportRefused({ answer }: Readonly<{ answer: ImportSignIn | null }>) {
  const t = useT();
  if (answer?.status !== 'refused') {
    return null;
  }
  return (
    <Callout.Root tone="danger" icon="alert-triangle">
      <Callout.Title>{t(REFUSAL_LINE[answer.reason])}</Callout.Title>
      {answer.message ? <Callout.Detail>{answer.message}</Callout.Detail> : null}
    </Callout.Root>
  );
}
