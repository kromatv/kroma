import type { SettingRow } from '@kromatv/client/admin';
import { Box, Switch, Text } from '@kromatv/ui/kit';
import { ActionControl } from './action-control';
import { EditableText } from './editable-text';
import { SecretInput } from './secret-input';
import { SettingSelect } from './setting-select';

// An object would otherwise stringify to "[object Object]".
function asText(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return JSON.stringify(v);
}

export function Control({
  row,
  onChange,
}: Readonly<{ row: SettingRow; onChange: (v: unknown) => void }>) {
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
    <Box maxW={380}>
      <Text variant="meta" color="text/60" textAlign="right">
        {asText(row.value)}
      </Text>
    </Box>
  );
}
