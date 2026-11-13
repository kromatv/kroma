import { apiErrorText } from '@kromatv/client';
import { SSO_CALLBACK_PATH } from '@kromatv/client/sso';
import { useT } from '@kromatv/ui';
import {
  Box,
  Button,
  Callout,
  CopyButton,
  EmptyState,
  Row,
  Section,
  styles,
  Text,
  useStyles,
} from '@kromatv/ui/kit';
import { useEffect, useRef, useState } from 'react';
import { Denied, PageHeader, useCap } from '#web/features/admin/shell';
import {
  emptyProvider,
  isDirty,
  type ProviderForm,
  type SignInForm,
  toForm,
  toSave,
} from '#web/features/admin/sign-in-form';
import { MethodSwitches } from '#web/features/admin/sign-in-methods';
import { ProviderCard } from '#web/features/admin/sign-in-provider-card';
import { useAuth } from '#web/shared/lib/auth';
import { takeOutcome } from '#web/shared/lib/sso-flow';
import { useProviderFlow } from '#web/shared/lib/use-provider-flow';

const sDefinition = styles({ mono: { fontFamily: 'monospace' } });

function RedirectUris({ named }: Readonly<{ named: readonly string[] }>) {
  const s = useStyles(sDefinition);
  const t = useT();
  const uris = named.length > 0 ? named : [`${window.location.origin}${SSO_CALLBACK_PATH}`];
  return (
    <Callout.Root tone="accent" icon="arrow-back-up">
      <Callout.Title>{t('admin.signInRedirect')}</Callout.Title>
      <Callout.Detail>{t('admin.signInRedirectHint')}</Callout.Detail>
      <Box gap={8} mt={10}>
        {uris.map((uri) => (
          <Row key={uri} gap={10}>
            <Text variant="meta" style={s.mono} selectable>
              {uri}
            </Text>
            <CopyButton
              value={uri}
              size="sm"
              variant="ghost"
              iconOnly
              label={t('common.copy')}
              copiedLabel={t('common.copied')}
            />
          </Row>
        ))}
      </Box>
    </Callout.Root>
  );
}

/** Admin → Sign-in: which ways into the server are on, and the OpenID Connect
 * providers people can sign in through. Backed by `/api/admin/sign-in*`. */
export function SignInPage() {
  const t = useT();
  const { client } = useAuth();
  const canManage = useCap('settings.manage');
  const startFlow = useProviderFlow();

  const keySeq = useRef(0);
  const [outcome] = useState(() => takeOutcome('test'));
  const [saved, setSaved] = useState<SignInForm | null>(null);
  const [form, setForm] = useState<SignInForm | null>(null);
  const [redirectUris, setRedirectUris] = useState<string[]>([]);
  const [expandedKey, setExpandedKey] = useState<string | null>(
    outcome ? `provider-${outcome.provider}` : null,
  );
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    client.sso.config().then(
      (config) => {
        if (cancelled) return;
        setSaved(toForm(config));
        setForm(toForm(config));
        setRedirectUris(config.redirectUris);
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [client]);

  if (!canManage) return <Denied />;
  if (!form || !saved) return null;
  const unsaved = isDirty(form, saved);

  const update = (patch: Partial<SignInForm>) => {
    setForm({ ...form, ...patch });
    setFlash(false);
  };
  const patchProvider = (key: string, patch: Partial<ProviderForm>) =>
    update({ providers: form.providers.map((p) => (p.key === key ? { ...p, ...patch } : p)) });
  const addProvider = () => {
    const added = emptyProvider(`draft-${keySeq.current++}`);
    update({ providers: [...form.providers, added] });
    setExpandedKey(added.key);
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await client.sso.save(toSave(form));
      const config = await client.sso.config();
      const expanded = form.providers.findIndex((p) => p.key === expandedKey);
      setSaved(toForm(config));
      setForm(toForm(config));
      setRedirectUris(config.redirectUris);
      setExpandedKey(toForm(config).providers[expanded]?.key ?? null);
      setFlash(true);
    } catch (e) {
      setError(apiErrorText(e, t('jobs.saveFailed')));
    } finally {
      setBusy(false);
    }
  };

  const test = async (provider: ProviderForm) => {
    if (!provider.id) return;
    setTesting(provider.key);
    setError(null);
    try {
      await startFlow('test', provider.id, { returnTo: '/admin/sign-in' });
    } catch (e) {
      setError(apiErrorText(e, t('admin.signInTestFailed')));
      setTesting(null);
    }
  };

  return (
    <>
      <PageHeader.Root>
        <PageHeader.Title>{t('admin.signInTitle')}</PageHeader.Title>
        <PageHeader.Subtitle>{t('admin.signInSub')}</PageHeader.Subtitle>
      </PageHeader.Root>

      <Section.Root mt={24}>
        <Section.Header>
          <Section.Title>{t('admin.signInMethods')}</Section.Title>
        </Section.Header>
        <MethodSwitches form={form} update={update} />
      </Section.Root>

      <Section.Root mt={28}>
        <Section.Header>
          <Section.Title>{t('admin.signInProviders')}</Section.Title>
          <Section.Actions>
            <Button
              variant="glass"
              size="sm"
              icon="plus"
              label={t('admin.signInAddProvider')}
              onPress={addProvider}
            />
          </Section.Actions>
        </Section.Header>
        <Text variant="meta" color="textDim" mt={-8} mb={16}>
          {t('admin.signInProvidersHint')}
        </Text>
        {form.providers.length === 0 ? (
          <EmptyState.Root icon="login-2">
            <EmptyState.Title>{t('admin.signInNoProviders')}</EmptyState.Title>
            <EmptyState.Actions>
              <Button
                variant="glass"
                size="sm"
                icon="plus"
                label={t('admin.signInAddProvider')}
                onPress={addProvider}
              />
            </EmptyState.Actions>
          </EmptyState.Root>
        ) : (
          <Box gap={12}>
            <RedirectUris named={redirectUris} />
            {form.providers.map((p) => (
              <ProviderCard
                key={p.key}
                provider={p}
                expanded={expandedKey === p.key}
                unsaved={unsaved}
                testing={testing === p.key}
                result={outcome && outcome.provider === p.id ? outcome.result : null}
                onToggle={() => setExpandedKey((open) => (open === p.key ? null : p.key))}
                onChange={(patch) => patchProvider(p.key, patch)}
                onTest={() => void test(p)}
                onRemove={() =>
                  update({ providers: form.providers.filter((other) => other.key !== p.key) })
                }
              />
            ))}
          </Box>
        )}
      </Section.Root>

      <Row wrap gap={12} mt={24}>
        <Button
          label={busy ? t('common.saving') : t('common.save')}
          icon="device-floppy"
          variant="primary"
          onPress={() => void save()}
          disabled={busy || !unsaved}
        />
        {flash ? (
          <Text variant="meta" color="success">
            {t('admin.saved')}
          </Text>
        ) : null}
        {error ? (
          <Text variant="meta" color="danger">
            {error}
          </Text>
        ) : null}
      </Row>
    </>
  );
}
