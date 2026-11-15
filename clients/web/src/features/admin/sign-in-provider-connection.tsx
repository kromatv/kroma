import type { Discovered, PresetView } from '@kromatv/client/sso';
import type { Translate } from '@kromatv/i18n';
import { useT } from '@kromatv/ui';
import {
  Box,
  Button,
  Disclosure,
  Field,
  Icon,
  Row,
  styles,
  Text,
  useStyles,
} from '@kromatv/ui/kit';
import { useState } from 'react';
import { type ProviderForm, reasonKey } from '#web/features/admin/sign-in-form';
import { RedirectUris } from '#web/features/admin/sign-in-redirect-uris';
import { useAuth } from '#web/shared/lib/auth';
import { OutsideLink } from '#web/shared/ui/outside-link';
import { TagsInput } from '#web/shared/ui/tags-input';

const sDefinition = styles({ mono: { fontFamily: 'monospace' } });

function said(found: Discovered, t: Translate): string {
  if (found.ok) return t('admin.signInAddressFound', { issuer: found.issuer ?? '' });
  const key = found.reason ? reasonKey(found.reason) : null;
  return key ? t(key) : t('sso.reason.other', { reason: found.reason ?? '' });
}

function AddressCheck({ found }: Readonly<{ found: Discovered }>) {
  const t = useT();
  return (
    <Row gap={6} mt={8}>
      <Icon
        name={found.ok ? 'check' : 'x'}
        size={15}
        thickness={2.4}
        color={found.ok ? 'success' : 'danger'}
      />
      <Text variant="meta" color={found.ok ? 'success' : 'danger'}>
        {said(found, t)}
      </Text>
    </Row>
  );
}

function SetupLinks({ preset }: Readonly<{ preset: PresetView }>) {
  const t = useT();
  return (
    <Row wrap gap={10} mb={16}>
      {preset.console ? (
        <Button
          variant="glass"
          size="sm"
          icon="external-link"
          label={t('admin.signInConsole', { provider: preset.label })}
          asChild
        >
          <OutsideLink to={preset.console} />
        </Button>
      ) : null}
      <Button
        variant="ghost"
        size="sm"
        icon="book"
        label={t('admin.signInDocs', { provider: preset.label })}
        asChild
      >
        <OutsideLink to={preset.docs} />
      </Button>
    </Row>
  );
}

/** How the server reaches a provider: the address to register there, where
 * the provider has its application made and explains how, the provider's own
 * address, and this server's registration. A provider from the environment
 * shows its address and client without letting them be edited. */
export function ConnectionFields({
  provider: p,
  preset,
  redirectUris,
  set,
}: Readonly<{
  provider: ProviderForm;
  preset: PresetView | undefined;
  redirectUris: readonly string[];
  set: (patch: Partial<ProviderForm>) => void;
}>) {
  const s = useStyles(sDefinition);
  const t = useT();
  const { client } = useAuth();
  const [checking, setChecking] = useState(false);
  const [found, setFound] = useState<Discovered | null>(null);

  const check = async () => {
    setChecking(true);
    try {
      setFound(await client.sso.discover(p.issuer.trim()));
    } catch {
      setFound({ ok: false, reason: 'discovery.unreachable' });
    } finally {
      setChecking(false);
    }
  };

  return (
    <>
      <Text variant="overline" color="textDim" mb={12}>
        {t('admin.signInSectionConnection')}
      </Text>

      <Box maxW={560} mb={preset ? 12 : 16}>
        <RedirectUris named={redirectUris} />
      </Box>
      {preset ? <SetupLinks preset={preset} /> : null}

      <Field.Root label={t('admin.signInIssuer')} maxW={560} mb={16}>
        <Row gap={10}>
          <Box flex minW={0}>
            <Field.Input
              icon="world"
              value={p.issuer}
              onValueChange={(issuer) => {
                set({ issuer });
                setFound(null);
              }}
              placeholder={preset?.issuer ?? 'https://id.example.com'}
              keyboardType="url"
              textStyle={s.mono}
              readOnly={p.fromEnv}
            />
          </Box>
          <Button
            variant="glass"
            size="sm"
            icon="plug-connected"
            label={checking ? t('admin.signInChecking') : t('admin.signInCheck')}
            onPress={() => void check()}
            disabled={checking || !p.issuer.trim()}
          />
        </Row>
        {found ? <AddressCheck found={found} /> : null}
        <Field.Hint>
          {p.fromEnv ? t('admin.signInFromEnvHint') : t('admin.signInIssuerHint')}
        </Field.Hint>
      </Field.Root>

      <Row wrap gap={16} mb={16} align="flex-start">
        <Field.Root label={t('admin.signInClientId')} flex minW={220} maxW={320}>
          <Field.Input
            icon="id"
            value={p.clientId}
            onValueChange={(clientId) => set({ clientId })}
            textStyle={s.mono}
            readOnly={p.fromEnv}
          />
        </Field.Root>
        {p.fromEnv ? null : (
          <Field.Root label={t('admin.signInClientSecret')} flex minW={220} maxW={320}>
            <Field.Input
              type="password"
              icon="key"
              value={p.clientSecret}
              onValueChange={(clientSecret) => set({ clientSecret })}
              placeholder={p.hasSecret ? t('admin.signInSecretKeep') : ''}
              textStyle={s.mono}
            />
            <Field.Hint>{t('admin.signInClientSecretHint')}</Field.Hint>
          </Field.Root>
        )}
      </Row>

      <Disclosure.Root>
        <Disclosure.Trigger>{t('admin.signInAdvanced')}</Disclosure.Trigger>
        <Disclosure.Panel>
          <Field.Root label={t('admin.signInScopes')} maxW={560} mb={16}>
            <TagsInput
              label={t('admin.signInScopes')}
              value={p.scopes}
              onValueChange={(scopes) => set({ scopes })}
              placeholder="offline_access"
              separators={' ,\n'}
              textStyle={s.mono}
            />
            <Field.Hint>{t('admin.signInScopesHint')}</Field.Hint>
          </Field.Root>
          <Field.Root label={t('admin.signInGroupClaim')} maxW={320} mb={16}>
            <Field.Input
              value={p.groupClaim}
              onValueChange={(groupClaim) => set({ groupClaim })}
              placeholder="groups"
              textStyle={s.mono}
            />
            <Field.Hint>{t('admin.signInGroupClaimHint')}</Field.Hint>
          </Field.Root>
        </Disclosure.Panel>
      </Disclosure.Root>
    </>
  );
}
