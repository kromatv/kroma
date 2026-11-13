import { apiErrorText } from '@kromatv/client';
import { SSO_CALLBACK_PATH } from '@kromatv/client/sso';
import { useT } from '@kromatv/ui';
import {
  Box,
  Button,
  Callout,
  CopyButton,
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
  type MethodForm,
  moved,
  type ProviderForm,
  providersOf,
  type SignInForm,
  toForm,
  toSave,
} from '#web/features/admin/sign-in-form';
import { BuiltInRow } from '#web/features/admin/sign-in-methods';
import { ProviderCard } from '#web/features/admin/sign-in-provider-card';
import { useAuth } from '#web/shared/lib/auth';
import { takeOutcome } from '#web/shared/lib/sso-flow';
import { useAuthFlows } from '#web/shared/lib/use-auth-flows';

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

/** Admin → Sign-in: every way into the server as one ordered list, with the
 * password form, the passkey button and the OpenID Connect providers people
 * can sign in through. Backed by `/api/admin/sign-in*`. */
export function SignInPage() {
  const t = useT();
  const { client } = useAuth();
  const canManage = useCap('settings.manage');
  const flows = useAuthFlows();

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
  const last = form.methods.length - 1;

  const update = (methods: MethodForm[]) => {
    setForm({ methods });
    setFlash(false);
  };
  const patch = (key: string, change: Partial<MethodForm>) =>
    update(form.methods.map((m) => (m.key === key ? ({ ...m, ...change } as MethodForm) : m)));
  const addProvider = () => {
    const added = emptyProvider(`draft-${keySeq.current++}`);
    update([...form.methods, added]);
    setExpandedKey(added.key);
  };

  const adopt = async () => {
    const config = await client.sso.config();
    setSaved(toForm(config));
    setRedirectUris(config.redirectUris);
    return toForm(config);
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await client.sso.save(toSave(form));
      const expanded = form.methods.findIndex((m) => m.key === expandedKey);
      const fresh = await adopt();
      setForm(fresh);
      setExpandedKey(fresh.methods[expanded]?.key ?? null);
      setFlash(true);
    } catch (e) {
      setError(apiErrorText(e, t('jobs.saveFailed')));
    } finally {
      setBusy(false);
    }
  };

  const refreshPictures = async () => {
    const fresh = providersOf(await adopt());
    update(
      form.methods.map((m) => {
        const now = m.kind === 'oidc' ? fresh.find((p) => p.id === m.id) : undefined;
        return m.kind === 'oidc' && now ? { ...m, image: now.image, hasImage: now.hasImage } : m;
      }),
    );
  };

  const test = async (provider: ProviderForm) => {
    if (!provider.id) return;
    setTesting(provider.key);
    setError(null);
    try {
      await flows.test(provider.id, { returnTo: '/admin/sign-in' });
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
          {t('admin.signInMethodsHint')}
        </Text>
        <Box gap={12}>
          {form.methods.map((method, index) =>
            method.kind === 'oidc' ? (
              <ProviderCard
                key={method.key}
                provider={method}
                expanded={expandedKey === method.key}
                first={index === 0}
                last={index === last}
                unsaved={unsaved}
                testing={testing === method.key}
                result={outcome && outcome.provider === method.id ? outcome.result : null}
                onToggle={() => setExpandedKey((open) => (open === method.key ? null : method.key))}
                onMove={(by) => update(moved(form.methods, index, by))}
                onChange={(change) => patch(method.key, change)}
                onPicture={() => void refreshPictures()}
                onTest={() => void test(method)}
                onRemove={() => update(form.methods.filter((other) => other.key !== method.key))}
              />
            ) : (
              <BuiltInRow
                key={method.key}
                method={method}
                first={index === 0}
                last={index === last}
                onMove={(by) => update(moved(form.methods, index, by))}
                onEnabled={(enabled) => patch(method.key, { enabled })}
              />
            ),
          )}
          {providersOf(form).length > 0 ? <RedirectUris named={redirectUris} /> : null}
        </Box>
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
