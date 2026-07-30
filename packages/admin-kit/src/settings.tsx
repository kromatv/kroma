// Generic settings renderer: fetches a settings view (general / network / vpn /
// acquisition / ...) and renders its groups of toggle/select/text/value rows.
// Changes persist immediately (optimistic) via PUT /api/admin/settings. Shared
// by the built-in settings pages AND the VPN / Acquisition module pages.

import type { MessageKey, SettingGroup, SettingRow } from '@kroma/core';
import { useT } from '@kroma/ui';
import { useEffect, useState } from 'react';
import { useAdminKit } from './context';
import { Select, TextArea, TextInput } from './forms';
import { PageHeader } from './header';
import { Denied, useCap } from './hooks';
import { Card, Toggle } from './primitives';

interface SettingsViewProps {
  view: string;
  titleKey: MessageKey;
  subtitleKey: MessageKey;
  embedded?: boolean;
}

// A `secret` row records only WHETHER it now holds a value, not the value
// itself: the server never sends one back, and keeping it in state would put
// a signing key in the React tree for the rest of the session.
function applySetting(groups: SettingGroup[], key: string, value: unknown): SettingGroup[] {
  const applied = (r: SettingRow): SettingRow =>
    r.kind === 'secret' ? { ...r, value: '', configured: Boolean(value) } : { ...r, value };
  return groups.map((g) => ({
    ...g,
    rows: g.rows.map((r) => (r.key === key ? applied(r) : r)),
  }));
}

export function SettingsView(props: Readonly<SettingsViewProps>) {
  // Settings views require the `settings.manage` capability (server enforces it
  // too); deny cleanly instead of rendering a page that would 403 on every call.
  if (!useCap('settings.manage')) return <Denied />;
  return <SettingsViewInner {...props} />;
}

function SettingsViewInner({ view, titleKey, subtitleKey, embedded }: Readonly<SettingsViewProps>) {
  const t = useT();
  const { client } = useAdminKit();
  const [groups, setGroups] = useState<SettingGroup[]>([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let active = true;
    client
      .adminSettings(view)
      .then((r) => active && setGroups(r.groups))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [client, view]);

  function set(key: string, value: unknown) {
    setGroups((gs) => applySetting(gs, key, value));
    client
      .updateSettings({ [key]: value })
      .then(() => {
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
      })
      .catch(() => undefined);
  }

  return (
    <>
      {embedded ? null : (
        <PageHeader
          title={t(titleKey)}
          subtitle={t(subtitleKey)}
          action={
            <span className="shrink-0 text-[13px] font-semibold text-success">
              {saved ? t('admin.saved') : ''}
            </span>
          }
        />
      )}
      <div className={`${embedded ? '' : 'mt-6 '}flex flex-col gap-5.5`}>
        {groups.map((g) => (
          <Card key={g.title} className="overflow-hidden">
            <div className="border-b border-border px-5.5 py-4.25">
              <div className="font-display text-[15px] font-bold">{g.title}</div>
              {g.desc ? <div className="mt-0.75 text-[12.5px] text-dim">{g.desc}</div> : null}
            </div>
            {g.rows.map((r) => (
              <Row key={r.key} row={r} onChange={(v) => set(r.key, v)} />
            ))}
          </Card>
        ))}
      </div>
    </>
  );
}

function Row({ row, onChange }: Readonly<{ row: SettingRow; onChange: (v: unknown) => void }>) {
  const t = useT();
  return (
    <div className="flex flex-wrap items-center justify-between gap-5 border-b border-white/4 px-5.5 py-4 last:border-b-0">
      <div className="min-w-0">
        <div className="text-[14.5px] font-bold">{row.label}</div>
        {row.desc ? <div className="mt-0.75 text-[12.5px] text-dim">{row.desc}</div> : null}
        {!row.applied && row.kind !== 'value' ? (
          <div className="mt-1 text-[11px] font-semibold uppercase tracking-widest text-text/30">
            {t('admin.prefSaved')}
          </div>
        ) : null}
      </div>
      <div className="shrink-0">
        <Control row={row} onChange={onChange} />
      </div>
    </div>
  );
}

// An object would otherwise stringify to "[object Object]".
function asText(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return JSON.stringify(v);
}

function Control({ row, onChange }: Readonly<{ row: SettingRow; onChange: (v: unknown) => void }>) {
  if (row.kind === 'toggle') {
    return <Toggle on={Boolean(row.value)} onChange={onChange} />;
  }
  if (row.kind === 'select') {
    return <Select value={asText(row.value)} options={row.options ?? []} onChange={onChange} />;
  }
  if (row.kind === 'text') {
    return <EditableText value={asText(row.value)} onCommit={onChange} />;
  }
  if (row.kind === 'secret') {
    return <SecretInput configured={Boolean(row.configured)} onCommit={onChange} />;
  }
  // value (read-only)
  return (
    <span className="text-[13.5px] font-semibold tabular-nums text-text/60">
      {asText(row.value)}
    </span>
  );
}

// A write-only credential (PEM key or service-account JSON): starts empty
// every time, since the server never sends a stored secret back, and blur
// commits only a non-empty value so leaving the field alone can never wipe a
// working key by accident. Removing one is the Clear button's job.
function SecretInput({
  configured,
  onCommit,
}: Readonly<{ configured: boolean; onCommit: (v: string) => void }>) {
  const t = useT();
  const [v, setV] = useState('');
  return (
    <div className="flex flex-col items-end gap-1.5">
      <TextArea
        value={v}
        rows={3}
        mono
        spellCheck={false}
        autoComplete="off"
        placeholder={configured ? t('admin.secretReplace') : undefined}
        onChange={setV}
        onBlur={() => {
          if (!v.trim()) return;
          onCommit(v);
          setV('');
        }}
        className="min-w-70"
      />
      <div className="flex items-center gap-2.5">
        <span
          className={`text-[11px] font-semibold uppercase tracking-widest ${
            configured ? 'text-success' : 'text-text/30'
          }`}
        >
          {configured ? t('admin.secretSet') : t('admin.secretUnset')}
        </span>
        {configured ? (
          <button
            type="button"
            onClick={() => {
              setV('');
              onCommit('');
            }}
            className="text-[11px] font-semibold uppercase tracking-widest text-text/40 underline-offset-2 hover:text-danger hover:underline"
          >
            {t('admin.secretClear')}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function EditableText({
  value,
  onCommit,
}: Readonly<{ value: string; onCommit: (v: string) => void }>) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <TextInput
      value={v}
      onChange={setV}
      onBlur={() => {
        if (v !== value) onCommit(v);
      }}
      className="min-w-50"
    />
  );
}
