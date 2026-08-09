// The registry drawer's rows: the pinned official slot, one editable row per
// operator-added registry, and the add flow with its verify-before-save step.
// The drawer container and its draft state live in module-registries.tsx.

import type { StoreRegistry, StoreRegistryPreview } from '@kroma/core';
import { useT } from '@kroma/ui';
import { Button, Field, IconButton, Surface, Switch } from '@kroma/ui/kit';
import { useState } from 'react';
import { useAsyncAction } from '#web/features/admin/hooks';
import { adminApi, message, previewRegistry } from '#web/features/admin/module-api';

/** One operator-added registry, as stored in the `moduleRegistries` setting. */
export interface ExtraRegistry {
  name: string;
  url: string;
  enabled: boolean;
}

const HTTPS = /^https:\/\/\S+$/;

export function StatusLine({ status }: Readonly<{ status: StoreRegistry }>) {
  const t = useT();
  if (status.skipped) return <p className="text-xs text-dim">{status.skipped}</p>;
  if (status.error) {
    return <p className="break-all text-xs text-danger">{status.error}</p>;
  }
  return (
    <p className="text-xs text-muted">
      {t('admin.registriesModuleCount', { count: status.moduleCount })}
      {status.shadowed.length > 0 && (
        <> · {t('admin.registriesShadowed', { count: status.shadowed.length })}</>
      )}
    </p>
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
    <Surface elevated pad="none" radius={16} p={16} gap={8}>
      <div className="flex items-center gap-2">
        <span className="font-semibold text-text">{t('admin.registriesOfficial')}</span>
        <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-bold text-accent">
          {t('admin.registriesOfficialPinned')}
        </span>
      </div>
      <p className="text-xs text-muted">{t('admin.registriesOfficialDesc')}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Field
          label="URL"
          hideLabel
          type="url"
          icon="world"
          value={value}
          onChange={setValue}
          placeholder="https://.../modules.json"
          flex={1}
          minW={0}
        />
        <Button
          variant="glass"
          size="sm"
          label={t('common.save')}
          onPress={save}
          loading={busy}
          disabled={!dirty}
        />
      </div>
      {error && <p className="text-xs font-semibold text-danger">{error}</p>}
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
    <Surface elevated pad="none" radius={16} p={16} gap={8}>
      <div className="flex flex-wrap items-center gap-2">
        <Field
          label={t('admin.registriesName')}
          hideLabel
          icon="tag"
          value={registry.name}
          onChange={(name) => onChange({ ...registry, name })}
          placeholder={t('admin.registriesName')}
          w={176}
        />
        <Switch
          checked={registry.enabled}
          onChange={(enabled) => onChange({ ...registry, enabled })}
          label={registry.name || registry.url}
        />
        <span className="text-xs text-dim">
          {registry.enabled ? t('admin.modulesEnabled') : t('admin.modulesDisabled')}
        </span>
        <div className="flex-1" />
        <IconButton
          variant="ghost"
          icon="trash"
          label={t('admin.registriesRemove')}
          onPress={busy ? () => {} : onRemove}
        />
      </div>
      <Field
        label="URL"
        hideLabel
        type="url"
        icon="world"
        value={registry.url}
        onChange={(url) => onChange({ ...registry, url })}
        placeholder="https://.../modules.json"
      />
      <StatusLine status={status} />
    </Surface>
  );
}

function PreviewResult({ preview }: Readonly<{ preview: StoreRegistryPreview }>) {
  const t = useT();
  if (preview.ok) {
    return (
      <div className="rounded-lg border border-[rgba(70,208,141,.25)] bg-[rgba(70,208,141,.07)] px-3 py-2.5">
        <p className="text-xs font-semibold text-success">
          {t('admin.registriesPreviewOk', { count: preview.moduleCount })}
        </p>
        {preview.modules.length > 0 && (
          <p className="mt-1 text-[11px] text-muted">
            {preview.modules.map((m) => `${m.name} v${m.version}`).join(' · ')}
          </p>
        )}
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-danger/25 bg-danger/8 px-3 py-2.5">
      <p className="text-xs font-semibold text-danger">{t('admin.registriesPreviewFail')}</p>
      {preview.error && <p className="mt-1 break-all text-[11px] text-muted">{preview.error}</p>}
    </div>
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
    <Surface elevated pad="none" radius={16} p={16} gap={10}>
      <span className="font-semibold text-text">{t('admin.registriesAdd')}</span>
      <div className="flex flex-wrap items-center gap-2">
        <Field
          label={t('admin.registriesName')}
          hideLabel
          icon="tag"
          value={name}
          onChange={setName}
          placeholder={t('admin.registriesName')}
          w={176}
        />
        <Field
          label="URL"
          hideLabel
          type="url"
          icon="world"
          value={url}
          onChange={setUrl}
          placeholder="https://.../modules.json"
          flex={1}
          minW={0}
        />
      </div>
      {url.trim() !== '' && !valid && (
        <p className="text-xs text-danger">{t('admin.registriesHttps')}</p>
      )}
      {check.error && <p className="break-all text-xs text-danger">{check.error}</p>}
      {preview?.url === url.trim() && <PreviewResult preview={preview.result} />}
      <div className="flex items-center justify-between gap-2">
        <p className="flex-1 text-[11px] leading-relaxed text-dim">
          {t('admin.registriesTrustNote')}
        </p>
        <div className="flex shrink-0 items-center gap-2">
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
        </div>
      </div>
    </Surface>
  );
}
