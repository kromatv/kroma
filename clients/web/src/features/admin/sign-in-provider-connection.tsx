import type { Discovered } from '@kromatv/client/sso';
import type { Translate } from '@kromatv/i18n';
import { useT } from '@kromatv/ui';
import {
  Box,
  Button,
  Disclosure,
  Field,
  Icon,
  Row,
  Select,
  styles,
  Text,
  useStyles,
} from '@kromatv/ui/kit';
import { useState } from 'react';
import {
  PROVIDER_ICONS,
  PROVIDER_PRESETS,
  type ProviderForm,
  pictureOf,
  presetOf,
  reasonKey,
} from '#web/features/admin/sign-in-form';
import { PictureField } from '#web/features/admin/sign-in-provider-picture';
import { useAuth } from '#web/shared/lib/auth';

const sDefinition = styles({ mono: { fontFamily: 'monospace' } });

const OTHER = 'other';

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

/** How the server reaches a provider: its name and button, its address, and
 * this server's registration there. A provider from the environment shows its
 * address and client without letting them be edited. */
export function ConnectionFields({
  provider: p,
  set,
  onPicture,
}: Readonly<{
  provider: ProviderForm;
  set: (patch: Partial<ProviderForm>) => void;
  /** The provider's picture changed on the server. */
  onPicture: () => void;
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

  const preset = presetOf(p.preset);
  const choosePreset = (id: string) => {
    const chosen = presetOf(id);
    set({
      preset: id,
      icon: chosen?.icon ?? p.icon,
      label: p.label.trim() && p.label !== preset?.name ? p.label : (chosen?.name ?? p.label),
    });
  };

  return (
    <>
      <Field.Root label={t('admin.signInPreset')} maxW={320} mb={16}>
        <Select.Root
          label={t('admin.signInPreset')}
          value={p.preset || OTHER}
          onValueChange={(id) => choosePreset(id === OTHER ? '' : id)}
        >
          <Select.Trigger block />
          {PROVIDER_PRESETS.map((known) => (
            <Select.Item key={known.id} value={known.id} icon={known.icon}>
              {known.name}
            </Select.Item>
          ))}
          <Select.Item value={OTHER} icon="key">
            {t('admin.signInPresetOther')}
          </Select.Item>
        </Select.Root>
        <Field.Hint>{preset?.note ? t(preset.note) : t('admin.signInPresetHint')}</Field.Hint>
      </Field.Root>

      <Row wrap gap={16} mb={16} align="flex-start">
        <Field.Root label={t('admin.signInName')} flex minW={220} maxW={320}>
          <Field.Input
            icon="tag"
            value={p.label}
            onValueChange={(label) => set({ label })}
            placeholder={t('admin.signInNamePlaceholder')}
          />
          <Field.Hint>{t('admin.signInNameHint')}</Field.Hint>
        </Field.Root>
        {pictureOf(p) ? null : (
          <Field.Root label={t('admin.signInIcon')} w={200}>
            <Select.Root
              label={t('admin.signInIcon')}
              value={p.icon}
              onValueChange={(icon) => set({ icon })}
            >
              <Select.Trigger block />
              {PROVIDER_ICONS.map((choice) => (
                <Select.Item key={choice.icon} value={choice.icon} icon={choice.icon}>
                  {t(choice.labelKey)}
                </Select.Item>
              ))}
            </Select.Root>
          </Field.Root>
        )}
      </Row>

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

      <PictureField provider={p} onChanged={onPicture} />

      <Disclosure.Root>
        <Disclosure.Trigger>{t('admin.signInAdvanced')}</Disclosure.Trigger>
        <Disclosure.Panel>
          <Field.Root label={t('admin.signInScopes')} maxW={560} mb={16}>
            <Field.Input
              value={p.scopes}
              onValueChange={(scopes) => set({ scopes })}
              placeholder="offline_access"
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
