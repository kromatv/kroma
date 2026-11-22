import { useT } from '@kromatv/ui';
import { Button, Callout } from '@kromatv/ui/kit';
import { useImportSession } from '#web/features/admin/import/import-session.component';
import { useForgetSignIn } from '#web/features/admin/import/use-forget-sign-in.hook';
import { StepFailure } from '#web/shared/ui/step-failure.component';

/** Says that KROMA keeps the sign-in the owner made, and forgets it in one
 * press. Forgetting it starts the import over. */
export function KeptSignIn() {
  const t = useT();
  const { session, restart } = useImportSession();
  const forget = useForgetSignIn();
  const { importer, signIn } = session;
  if (!importer || !signIn) {
    return null;
  }
  return (
    <>
      <Callout.Root icon="key" size="sm">
        <Callout.Title>{t('setup.importKept')}</Callout.Title>
        <Callout.Actions>
          <Button
            variant="ghost"
            size="sm"
            label={t('setup.importForget')}
            loading={forget.isPending}
            onPress={() => forget.mutate({ importer, signIn }, { onSuccess: restart })}
          />
        </Callout.Actions>
      </Callout.Root>
      <StepFailure error={forget.isError ? t('setup.importForgetFailed') : null} />
    </>
  );
}
