// Generic settings renderer: fetches a settings view (general / network / vpn /
// acquisition / ...) and renders its groups of toggle/select/text/value rows.
// Changes persist immediately (optimistic) via PUT /api/admin/settings. Shared
// by the built-in settings pages AND the VPN / Acquisition module pages.

import {
  apiErrorText,
  type KromaClient,
  type MessageKey,
  type SettingGroup,
  type SettingRow,
} from '@kroma/core';
import { useT } from '@kroma/ui';
import {
  Box,
  Button,
  CardSkeleton,
  Divider,
  Field,
  Focusable,
  PageHeader,
  Select,
  Surface,
  Switch,
  Text,
  useStableCallback,
} from '@kroma/ui/kit';
import { memo, useEffect, useState } from 'react';
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

// A `secret`/`password` row records only WHETHER it now holds a value, not the
// value itself: the server never sends one back, and keeping it in state would
// put a signing key in the React tree for the rest of the session.
function applySetting(groups: SettingGroup[], key: string, value: unknown): SettingGroup[] {
  const applied = (r: SettingRow): SettingRow =>
    r.kind === 'secret' || r.kind === 'password'
      ? { ...r, value: '', configured: Boolean(value) }
      : { ...r, value };
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
  const [failure, setFailure] = useState<{ error: unknown } | null>(null);
  const [saved, setSaved] = useState(false);

  // One fetch, reused as the retry: a view that failed offers to ask again
  // rather than stranding the page on an empty panel.
  const [attempt, setAttempt] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` is an intentional re-run key (the retry), not something the effect reads
  useEffect(() => {
    let active = true;
    setFailure(null);
    client.admin
      .settings(view)
      .then((r) => active && setGroups(r.groups))
      .catch((e: unknown) => active && setFailure({ error: e }));
    return () => {
      active = false;
    };
  }, [client, view, attempt]);

  const set = useStableCallback((key: string, value: unknown) => {
    setGroups((gs) => (gs ? applySetting(gs, key, value) : gs));
    client.admin
      .updateSettings({ [key]: value })
      .then(() => {
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
      })
      .catch(() => undefined);
  });

  // Before the first answer there is nothing to show and nothing to claim: an
  // empty page would read as a settings view with no settings in it.
  if (!groups) {
    if (failure) {
      return <ModuleFailed error={failure.error} retry={() => setAttempt((n) => n + 1)} />;
    }
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
                <Row row={r} onChange={set} />
              </Box>
            ))}
          </Surface>
        ))}
      </Box>
    </Box>
  );
}

// Memoised: `applySetting` rebuilds every group and every row array on each
// edit, so without this boundary one keystroke re-rendered every row on the
// page rather than the one that changed.
const Row = memo(function Row({
  row,
  onChange,
}: Readonly<{ row: SettingRow; onChange: (key: string, v: unknown) => void }>) {
  const t = useT();
  const change = (v: unknown) => onChange(row.key, v);
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
      <Control row={row} onChange={change} />
    </Box>
  );
});

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
  if (row.kind === 'secret' || row.kind === 'password') {
    return (
      <SecretInput
        configured={Boolean(row.configured)}
        masked={row.kind === 'password'}
        onCommit={onChange}
      />
    );
  }
  if (row.kind === 'action') {
    return <ActionControl actionKey={row.key} />;
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

// A write-only credential: starts empty every time, since the server never
// sends a stored secret back, and blur commits only a non-empty value so
// leaving the field alone can never wipe a working key by accident. Removing
// one is the Clear button's job. `masked` picks the shape the credential
// wants: one hidden line for a password, a wrapping box for a PEM key or a
// service-account JSON.
function SecretInput({
  configured,
  masked,
  onCommit,
}: Readonly<{ configured: boolean; masked: boolean; onCommit: (v: string) => void }>) {
  const t = useT();
  const [v, setV] = useState('');
  const commit = () => {
    if (!v.trim()) return;
    onCommit(v);
    setV('');
  };
  const placeholder = configured ? t('admin.secretReplace') : undefined;
  return (
    <Box align="flex-end" gap={6}>
      <Field.Root
        label={t(configured ? 'admin.secretReplace' : 'admin.secretUnset')}
        hideLabel
        value={v}
        onValueChange={setV}
      >
        {masked ? (
          <Field.Input
            type="password"
            autoComplete="off"
            placeholder={placeholder}
            minW={280}
            onBlur={commit}
          />
        ) : (
          <Field.Textarea rows={3} placeholder={placeholder} minW={280} onBlur={commit} />
        )}
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

// An `action` row's server call and strings, keyed by the row's `key`. Core
// actions live here; a module page renders its own buttons rather than
// registering here.
type T = ReturnType<typeof useT>;
interface ActionSpec {
  label: MessageKey;
  running: MessageKey;
  failed: MessageKey;
  run: (client: KromaClient) => Promise<{ sentTo: string }>;
  ok: (t: T, r: { sentTo: string }) => string;
}
const ACTIONS: Record<string, ActionSpec> = {
  smtpTest: {
    label: 'admin.smtpTestRun',
    running: 'admin.smtpTestSending',
    failed: 'admin.smtpTestFailed',
    run: (client) => client.admin.testSmtp(),
    ok: (t, r) => t('admin.smtpTestOk', { email: r.sentTo }),
  },
};

function ActionControl({ actionKey }: Readonly<{ actionKey: string }>) {
  const t = useT();
  const { client } = useAdminHost();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const action = ACTIONS[actionKey];
  if (!action) return null;
  return (
    <Box align="flex-end" gap={6}>
      <Button
        variant="glass"
        size="sm"
        icon="mail"
        label={busy ? t(action.running) : t(action.label)}
        loading={busy}
        onPress={() => {
          setBusy(true);
          setResult(null);
          action
            .run(client)
            .then((r) => setResult({ ok: true, text: action.ok(t, r) }))
            .catch((e: unknown) =>
              setResult({ ok: false, text: apiErrorText(e, t(action.failed)) }),
            )
            .finally(() => setBusy(false));
        }}
      />
      {result ? (
        <Text variant="overline" color={result.ok ? 'success' : 'danger'}>
          {result.text}
        </Text>
      ) : null}
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
