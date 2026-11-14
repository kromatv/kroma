import { apiErrorText } from '@kromatv/client';
import { useT } from '@kromatv/ui';
import { Box, Button, Section, Text, useConfirm } from '@kromatv/ui/kit';
import { useBlocker } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { Denied, PageHeader, useCap } from '#web/features/admin/shell';
import {
  emptyProvider,
  isDirty,
  type MethodForm,
  moved,
  type PresetCatalog,
  type ProviderForm,
  type SignInForm,
  toForm,
  toSave,
} from '#web/features/admin/sign-in-form';
import { BuiltInRow } from '#web/features/admin/sign-in-methods';
import { passwordIsNeeded } from '#web/features/admin/sign-in-offered';
import { SignInPreview } from '#web/features/admin/sign-in-preview';
import { ProviderCard } from '#web/features/admin/sign-in-provider-card';
import { useAuth } from '#web/shared/lib/auth';
import { takeOutcome } from '#web/shared/lib/sso-flow';
import { useAuthFlows } from '#web/shared/lib/use-auth-flows';
import { SaveDock, type SaveStatus } from '#web/shared/ui/save-dock';

/** `methods` with `added` after the last provider, so a new one opens beside
 * the others rather than under the built-in methods. */
function withProvider(methods: readonly MethodForm[], added: ProviderForm): MethodForm[] {
  const after = methods.reduce((at, method, index) => (method.kind === 'oidc' ? index + 1 : at), 0);
  return [...methods.slice(0, after), added, ...methods.slice(after)];
}

/** Admin → Sign-in: every way into the server as one ordered list, with the
 * password form, the passkey button and the OpenID Connect providers people
 * can sign in through. Backed by `/api/admin/sign-in*`. */
export function SignInPage() {
  const t = useT();
  const { client } = useAuth();
  const canManage = useCap('settings.manage');
  const flows = useAuthFlows();
  const confirm = useConfirm();

  const keySeq = useRef(0);
  const [outcome] = useState(() => takeOutcome('test'));
  const [saved, setSaved] = useState<SignInForm | null>(null);
  const [form, setForm] = useState<SignInForm | null>(null);
  const [redirectUris, setRedirectUris] = useState<string[]>([]);
  const [catalog, setCatalog] = useState<PresetCatalog>([]);
  const [expandedKey, setExpandedKey] = useState<string | null>(
    outcome ? `provider-${outcome.provider}` : null,
  );
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [testing, setTesting] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unsaved = form !== null && saved !== null && isDirty(form, saved);

  useBlocker({
    shouldBlockFn: async ({ current, next }) => {
      if (!unsaved || next.pathname === current.pathname) return false;
      const leave = await confirm({
        title: t('admin.signInLeaveTitle'),
        message: t('admin.signInLeaveMessage'),
        confirmLabel: t('admin.signInLeaveDiscard'),
        cancelLabel: t('admin.signInLeaveStay'),
        destructive: true,
      });
      return !leave;
    },
    enableBeforeUnload: () => unsaved,
  });

  useEffect(() => {
    let cancelled = false;
    client.sso.config().then(
      (config) => {
        if (cancelled) return;
        setSaved(toForm(config));
        setForm(toForm(config));
        setRedirectUris(config.redirectUris);
        setCatalog(config.presets);
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [client]);

  if (!canManage) return <Denied />;
  if (!form || !saved) return null;
  const last = form.methods.length - 1;

  const update = (methods: MethodForm[]) => {
    setForm({ methods });
    setStatus('idle');
    setError(null);
  };
  const patch = (key: string, change: Partial<MethodForm>) =>
    update(form.methods.map((m) => (m.key === key ? ({ ...m, ...change } as MethodForm) : m)));
  const addProvider = () => {
    const added = emptyProvider(`draft-${keySeq.current++}`);
    update(withProvider(form.methods, added));
    setExpandedKey(added.key);
  };

  const adopt = async () => {
    const config = await client.sso.config();
    setSaved(toForm(config));
    setRedirectUris(config.redirectUris);
    return toForm(config);
  };

  const save = async () => {
    setStatus('saving');
    setError(null);
    try {
      await client.sso.save(toSave(form));
      const expanded = form.methods.findIndex((m) => m.key === expandedKey);
      const fresh = await adopt();
      setForm(fresh);
      setExpandedKey(fresh.methods[expanded]?.key ?? null);
      setStatus('saved');
    } catch (e) {
      setError(apiErrorText(e, t('jobs.saveFailed')));
      setStatus('error');
    }
  };

  const test = async (provider: ProviderForm) => {
    if (!provider.id) return;
    setTesting(provider.key);
    setError(null);
    try {
      await flows.test(provider.id, { returnTo: '/admin/sign-in' });
    } catch (e) {
      setError(apiErrorText(e, t('admin.signInTestFailed')));
      setStatus('error');
    } finally {
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
              variant="ghost"
              size="sm"
              icon="eye"
              label={t('admin.signInPreview')}
              onPress={() => setPreviewing(true)}
            />
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
                catalog={catalog}
                redirectUris={redirectUris}
                expanded={expandedKey === method.key}
                first={index === 0}
                last={index === last}
                unsaved={unsaved}
                testing={testing === method.key}
                result={outcome && outcome.provider === method.id ? outcome.result : null}
                onToggle={() => setExpandedKey((open) => (open === method.key ? null : method.key))}
                onMove={(by) => update(moved(form.methods, index, by))}
                onChange={(change) => patch(method.key, change)}
                onTest={() => void test(method)}
                onRemove={() => update(form.methods.filter((other) => other.key !== method.key))}
              />
            ) : (
              <BuiltInRow
                key={method.key}
                method={method}
                first={index === 0}
                last={index === last}
                locked={method.kind === 'password' && passwordIsNeeded(form)}
                onMove={(by) => update(moved(form.methods, index, by))}
                onEnabled={(enabled) => patch(method.key, { enabled })}
              />
            ),
          )}
        </Box>
      </Section.Root>

      <SaveDock
        dirty={unsaved}
        status={status}
        error={error}
        savedLabel={t('admin.saved')}
        onCancel={() => update(saved.methods)}
        onSave={() => void save()}
      />

      {previewing ? (
        <SignInPreview form={form} catalog={catalog} onClose={() => setPreviewing(false)} />
      ) : null}
    </>
  );
}
