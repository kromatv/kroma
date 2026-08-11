// The registry drawer's rows: the pinned official slot, one editable row per
// operator-added registry, and the add flow with its verify-before-save step.
// The drawer container and its draft state live in module-registries.tsx.

import type { StoreRegistry, StoreRegistryPreview } from '@kroma/core';
import { useT } from '@kroma/ui';
import {
  Button,
  Callout,
  Field,
  IconButton,
  Row,
  Spacer,
  Surface,
  Switch,
  Text,
} from '@kroma/ui/kit';
import { useState } from 'react';
import { useAsyncAction } from '#web/features/admin/hooks';
import { adminApi, message, previewRegistry } from '#web/features/admin/module-api';
import { Pill } from '#web/features/admin/pill';

/** One operator-added registry, as stored in the `moduleRegistries` setting. */
export interface ExtraRegistry {
  name: string;
  url: string;
  enabled: boolean;
}

const HTTPS = /^https:\/\/\S+$/;

export function StatusLine({ status }: Readonly<{ status: StoreRegistry }>) {
  const t = useT();
  if (status.skipped)
    return (
      <Text variant="meta" color="textDim">
        {status.skipped}
      </Text>
    );
  if (status.error) {
    return (
      <Text variant="meta" color="danger">
        {status.error}
      </Text>
    );
  }
  return (
    <Text variant="meta" color="textMuted">
      {t('admin.registriesModuleCount', { count: status.moduleCount })}
      {status.shadowed.length > 0 && (
        <> · {t('admin.registriesShadowed', { count: status.shadowed.length })}</>
      )}
    </Text>
  );
}

// The official slot stays first and wins an id clash, but WHERE it points is
// still editable: the long-standing escape hatch for aiming the Store at a
// mirror or a private build of the first-party catalog.
export function OfficialRow({
  status,
  onSaved,
}: Readonly<{ status: StoreRegistry; onSaved: () => void }>) {
  const t = useT();
  const [value, setValue] = useState(status.url);
  const { busy, error, run } = useAsyncAction();
  const dirty = value.trim() !== status.url;
  const save = () =>
    void run(async () => {
      await adminApi('/settings', {
        method: 'PUT',
        body: JSON.stringify({ moduleRegistryUrl: value.trim() }),
      });
      onSaved();
    }, message);
  return (
    <Surface elevated pad="none" radius="xl" p={16} gap={8}>
      <Row gap={8}>
        <Text variant="label">{t('admin.registriesOfficial')}</Text>
        <Pill ink="accentText" bg="accentSoft" variant="overline">
          {t('admin.registriesOfficialPinned')}
        </Pill>
      </Row>
      <Text variant="meta" color="textMuted">
        {t('admin.registriesOfficialDesc')}
      </Text>
      <Row wrap gap={8}>
        <Field.Root label="URL" hideLabel flex={1} minW={0}>
          <Field.Input
            type="url"
            icon="world"
            value={value}
            onValueChange={setValue}
            placeholder="https://.../modules.json"
          />
        </Field.Root>
        <Button
          variant="glass"
          size="sm"
          label={t('common.save')}
          onPress={save}
          loading={busy}
          disabled={!dirty}
        />
      </Row>
      {error && (
        <Text variant="meta" color="danger">
          {error}
        </Text>
      )}
      <StatusLine status={status} />
    </Surface>
  );
}

export function ExtraRow({
  registry,
  status,
  busy,
  onChange,
  onRemove,
}: Readonly<{
  registry: ExtraRegistry;
  status: StoreRegistry;
  busy: boolean;
  onChange: (next: ExtraRegistry) => void;
  onRemove: () => void;
}>) {
  const t = useT();
  return (
    <Surface elevated pad="none" radius="xl" p={16} gap={8}>
      <Row wrap gap={8}>
        <Field.Root label={t('admin.registriesName')} hideLabel w={176}>
          <Field.Input
            icon="tag"
            value={registry.name}
            onValueChange={(name) => onChange({ ...registry, name })}
            placeholder={t('admin.registriesName')}
          />
        </Field.Root>
        <Switch
          checked={registry.enabled}
          onChange={(enabled) => onChange({ ...registry, enabled })}
          label={registry.name || registry.url}
        />
        <Text variant="meta" color="textDim">
          {registry.enabled ? t('admin.modulesEnabled') : t('admin.modulesDisabled')}
        </Text>
        <Spacer />
        <IconButton
          variant="ghost"
          icon="trash"
          label={t('admin.registriesRemove')}
          onPress={busy ? () => {} : onRemove}
        />
      </Row>
      <Field.Root label="URL" hideLabel>
        <Field.Input
          type="url"
          icon="world"
          value={registry.url}
          onValueChange={(url) => onChange({ ...registry, url })}
          placeholder="https://.../modules.json"
        />
      </Field.Root>
      <StatusLine status={status} />
    </Surface>
  );
}

function PreviewResult({ preview }: Readonly<{ preview: StoreRegistryPreview }>) {
  const t = useT();
  if (preview.ok) {
    return (
      <Callout.Root
        tone="success"
        title={t('admin.registriesPreviewOk', { count: preview.moduleCount })}
        detail={
          preview.modules.length > 0
            ? preview.modules.map((m) => `${m.name} v${m.version}`).join(' · ')
            : undefined
        }
      />
    );
  }
  return (
    <Callout.Root
      tone="danger"
      title={t('admin.registriesPreviewFail')}
      detail={preview.error || undefined}
    />
  );
}

// URL first, then a verify step: the preview shows what the catalog serves (or
// the fetch error) before anything is saved. The Add button only arms once the
// currently-typed URL verified cleanly.
export function AddRegistry({
  onAdd,
  busy,
}: Readonly<{ onAdd: (r: ExtraRegistry) => void; busy: boolean }>) {
  const t = useT();
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [preview, setPreview] = useState<{ url: string; result: StoreRegistryPreview } | null>(
    null,
  );
  const check = useAsyncAction();
  const valid = HTTPS.test(url.trim());
  const verified = preview?.url === url.trim() && preview.result.ok;
  const runCheck = () =>
    void check.run(async () => {
      const target = url.trim();
      const result = await previewRegistry(target);
      setPreview({ url: target, result });
    }, message);
  const add = () => {
    onAdd({ name: name.trim() || url.trim(), url: url.trim(), enabled: true });
    setName('');
    setUrl('');
    setPreview(null);
  };
  return (
    <Surface elevated pad="none" radius="xl" p={16} gap={10}>
      <Text variant="label">{t('admin.registriesAdd')}</Text>
      <Row wrap gap={8}>
        <Field.Root label={t('admin.registriesName')} hideLabel w={176}>
          <Field.Input
            icon="tag"
            value={name}
            onValueChange={setName}
            placeholder={t('admin.registriesName')}
          />
        </Field.Root>
        <Field.Root label="URL" hideLabel flex={1} minW={0}>
          <Field.Input
            type="url"
            icon="world"
            value={url}
            onValueChange={setUrl}
            placeholder="https://.../modules.json"
          />
        </Field.Root>
      </Row>
      {url.trim() !== '' && !valid && (
        <Text variant="meta" color="danger">
          {t('admin.registriesHttps')}
        </Text>
      )}
      {check.error && (
        <Text variant="meta" color="danger">
          {check.error}
        </Text>
      )}
      {preview?.url === url.trim() && <PreviewResult preview={preview.result} />}
      <Row between gap={8}>
        <Text variant="meta" color="textDim" flex={1}>
          {t('admin.registriesTrustNote')}
        </Text>
        <Row shrink={0} gap={8}>
          <Button
            variant="glass"
            size="sm"
            label={t('admin.registriesCheck')}
            onPress={runCheck}
            loading={check.busy}
            disabled={!valid || check.busy}
          />
          <Button
            variant="primary"
            size="sm"
            label={t('common.add')}
            onPress={add}
            disabled={busy || !verified}
          />
        </Row>
      </Row>
    </Surface>
  );
}
