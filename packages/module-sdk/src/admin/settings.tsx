// Generic settings renderer: fetches a settings view (general / network / vpn /
// acquisition / ...) and renders its groups of toggle/select/text/value rows.
// Changes persist immediately (optimistic) via PUT /api/admin/settings. Shared
// by the built-in settings pages AND the VPN / Acquisition module pages.

import type { MessageKey, SettingGroup, SettingRow } from '@kroma/core';
import { useT } from '@kroma/ui';
import {
  Box,
  CardSkeleton,
  Divider,
  Field,
  Focusable,
  PageHeader,
  Select,
  Surface,
  Switch,
  Text,
} from '@kroma/ui/kit';
import { useEffect, useState } from 'react';
import { useAdminHost } from './context';
import { Denied } from './denied';
import { useCap } from './hooks';
import { ModuleFailed, ModuleLoading } from './page-states';

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
  const { client } = useAdminHost();
  // `null` is "not answered yet"; an empty array is a view with no groups.
  const [groups, setGroups] = useState<SettingGroup[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [saved, setSaved] = useState(false);

  // One fetch, reused as the retry: a view that failed offers to ask again
  // rather than stranding the page on an empty panel.
  const [attempt, setAttempt] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` is an intentional re-run key (the retry), not something the effect reads
  useEffect(() => {
    let active = true;
    setFailed(false);
    client
      .adminSettings(view)
      .then((r) => active && setGroups(r.groups))
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [client, view, attempt]);

  function set(key: string, value: unknown) {
    setGroups((gs) => (gs ? applySetting(gs, key, value) : gs));
    client
      .updateSettings({ [key]: value })
      .then(() => {
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
      })
      .catch(() => undefined);
  }

  // Before the first answer there is nothing to show and nothing to claim: an
  // empty page would read as a settings view with no settings in it.
  if (!groups) {
    if (failed) return <ModuleFailed retry={() => setAttempt((n) => n + 1)} />;
    return embedded ? <CardSkeleton fields={3} /> : <ModuleLoading panels={2} />;
  }

  return (
    <Box gap={embedded ? 0 : 24}>
      {embedded ? null : (
        <PageHeader.Root>
          <PageHeader.Title>{t(titleKey)}</PageHeader.Title>
          <PageHeader.Subtitle>{t(subtitleKey)}</PageHeader.Subtitle>
          {saved ? (
            <PageHeader.Actions>
              <Text variant="meta" color="success">
                {t('admin.saved')}
              </Text>
            </PageHeader.Actions>
          ) : null}
        </PageHeader.Root>
      )}
      <Box gap={22}>
        {groups.map((g) => (
          <Surface key={g.title} pad="none" overflow="hidden">
            <Box px={22} py={17} gap={3}>
              <Text variant="title">{g.title}</Text>
              {g.desc ? (
                <Text variant="meta" color="textDim">
                  {g.desc}
                </Text>
              ) : null}
            </Box>
            <Divider spacing={0} />
            {g.rows.map((r, i) => (
              <Box key={r.key}>
                {i > 0 ? <Divider spacing={0} /> : null}
                <Row row={r} onChange={(v) => set(r.key, v)} />
              </Box>
            ))}
          </Surface>
        ))}
      </Box>
    </Box>
  );
}

function Row({ row, onChange }: Readonly<{ row: SettingRow; onChange: (v: unknown) => void }>) {
  const t = useT();
  return (
    <Box row align="center" justify="space-between" gap={20} px={22} py={16}>
      <Box shrink={1} style={{ minWidth: 0 }}>
        <Text variant="label">{row.label}</Text>
        {row.desc ? (
          <Text variant="meta" color="textDim" style={{ marginTop: 3 }}>
            {row.desc}
          </Text>
        ) : null}
        {!row.applied && row.kind !== 'value' ? (
          <Text variant="overline" color="text/30" style={{ marginTop: 4 }}>
            {t('admin.prefSaved')}
          </Text>
        ) : null}
      </Box>
      <Control row={row} onChange={onChange} />
    </Box>
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
    return <Switch checked={Boolean(row.value)} onCheckedChange={onChange} label={row.label} />;
  }
  if (row.kind === 'select') {
    return (
      <SettingSelect
        label={row.label}
        value={asText(row.value)}
        options={row.options ?? []}
        onChange={onChange}
      />
    );
  }
  if (row.kind === 'text') {
    return <EditableText label={row.label} value={asText(row.value)} onCommit={onChange} />;
  }
  if (row.kind === 'secret') {
    return <SecretInput configured={Boolean(row.configured)} onCommit={onChange} />;
  }
  // value (read-only)
  return (
    <Text variant="meta" color="text/60">
      {asText(row.value)}
    </Text>
  );
}

/** Keeps the current value selectable even if it isn't in the list, so a
 * stored setting the schema no longer names still shows. */
function SettingSelect({
  label,
  value,
  options,
  onChange,
}: Readonly<{
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}>) {
  const all = value && !options.includes(value) ? [value, ...options] : options;
  return (
    <Select.Root label={label} value={value} onValueChange={onChange}>
      <Select.Trigger />
      {all.map((o) => (
        <Select.Item key={o} value={o}>
          {o}
        </Select.Item>
      ))}
    </Select.Root>
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
    <Box align="flex-end" gap={6}>
      <Field.Root
        label={t(configured ? 'admin.secretReplace' : 'admin.secretUnset')}
        hideLabel
        value={v}
        onValueChange={setV}
      >
        <Field.Textarea
          rows={3}
          placeholder={configured ? t('admin.secretReplace') : undefined}
          minW={280}
          onBlur={() => {
            if (!v.trim()) return;
            onCommit(v);
            setV('');
          }}
        />
      </Field.Root>
      <Box row align="center" gap={10}>
        <Text variant="overline" color={configured ? 'success' : 'text/30'}>
          {configured ? t('admin.secretSet') : t('admin.secretUnset')}
        </Text>
        {configured ? (
          // A Focusable, not a pressable Text: react-native-web wires Text
          // onPress as click only, so Enter/Space on the tabbed control would
          // do nothing.
          <Focusable
            label={t('admin.secretClear')}
            onPress={() => {
              setV('');
              onCommit('');
            }}
          >
            <Text variant="overline" color="text/40">
              {t('admin.secretClear')}
            </Text>
          </Focusable>
        ) : null}
      </Box>
    </Box>
  );
}

function EditableText({
  label,
  value,
  onCommit,
}: Readonly<{ label: string; value: string; onCommit: (v: string) => void }>) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <Field.Root label={label} hideLabel value={v} onValueChange={setV}>
      <Field.Input
        minW={200}
        onBlur={() => {
          if (v !== value) onCommit(v);
        }}
      />
    </Field.Root>
  );
}
