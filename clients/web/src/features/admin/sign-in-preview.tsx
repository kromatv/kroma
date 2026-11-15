import { signInLayout } from '@kromatv/core';
import { useT } from '@kromatv/ui';
import { Box, Button, Callout, Dialog, Field, Text } from '@kromatv/ui/kit';
import type { PresetCatalog, SignInForm } from '#web/features/admin/sign-in-form';
import { offeredBy, waitingProviders } from '#web/features/admin/sign-in-offered';
import { OrRule } from '#web/shared/ui/or-rule';
import { PressButtons } from '#web/shared/ui/press-buttons';

const still = () => undefined;

function PasswordStandIn({ primary }: Readonly<{ primary: boolean }>) {
  const t = useT();
  return (
    <Box w="100%" gap={12}>
      <Field.Root w="100%" size="md" label={t('auth.emailOrUsername')} hideLabel>
        <Field.Input
          icon="user"
          placeholder={t('auth.emailOrUsername')}
          value=""
          onValueChange={still}
          readOnly
        />
      </Field.Root>
      <Field.Root w="100%" size="md" label={t('auth.password')} hideLabel>
        <Field.Input
          icon="lock"
          placeholder={t('auth.password')}
          value=""
          onValueChange={still}
          readOnly
        />
      </Field.Root>
      <Box mt={4}>
        <Button
          block
          size="md"
          variant={primary ? 'primary' : 'glass'}
          label={t('auth.login')}
          onPress={still}
          disabled
        />
      </Box>
    </Box>
  );
}

/** The sign-in screen as people will see it once `form` is saved, drawn with
 * the screen's own buttons and arranged by the screen's own rule. Nothing in
 * it can be pressed. A provider that is on but not live is drawn too, and
 * named underneath as not shown yet. */
export function SignInPreview({
  form,
  catalog,
  onClose,
}: Readonly<{
  form: SignInForm;
  catalog: PresetCatalog;
  onClose: () => void;
}>) {
  const t = useT();
  const layout = signInLayout(offeredBy(form, catalog, t('admin.signInUntitled')));
  const formLeads = layout.lead === 'password' || layout.presses.length === 0;
  const waiting = waitingProviders(form).map(
    (provider) => provider.label.trim() || t('admin.signInUntitled'),
  );
  const buttons =
    layout.presses.length > 0 ? (
      <PressButtons
        presses={layout.presses}
        primary={!formLeads}
        disabled={false}
        onPress={still}
      />
    ) : null;
  const password = layout.password ? <PasswordStandIn primary={formLeads} /> : null;
  const [first, second] = formLeads ? [password, buttons] : [buttons, password];

  return (
    <Dialog.Root
      open
      title={t('admin.signInPreviewTitle')}
      description={t('admin.signInPreviewHint')}
      width="sm"
      onClose={onClose}
    >
      {first || second ? (
        <div inert>
          <Box w="100%" gap={20}>
            {first}
            {first && second ? <OrRule /> : null}
            {second}
          </Box>
        </div>
      ) : (
        <Text variant="meta" color="textDim">
          {t('admin.signInPreviewEmpty')}
        </Text>
      )}
      {waiting.length > 0 ? (
        <Callout.Root tone="accent" icon="plug-connected">
          <Callout.Detail>
            {t('admin.signInPreviewWaiting', { names: waiting.join(', ') })}
          </Callout.Detail>
        </Callout.Root>
      ) : null}
    </Dialog.Root>
  );
}
