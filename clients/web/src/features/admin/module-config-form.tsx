// Typed settings form for a module's declared `config` fields. Renders the right
// control per field kind (text / number / checkbox / select) and PUTs properly
// typed JSON values to /api/admin/modules/:id/config (bool and number, not the
// stringified values the old text-only form sent).

import type { ConfigField } from '@kroma/module-sdk';
import { useT } from '@kroma/ui';
import {
  Box,
  Button,
  Divider,
  Field,
  ListRow,
  NumberField,
  Row,
  Select,
  Switch,
} from '@kroma/ui/kit';
import { type ReactNode, useState } from 'react';
import { adminApi } from '#web/features/admin/module-api';

type ConfigValue = string | number | boolean;

const CONTROL_WIDTH = 160;
const SELECT_STYLE = { width: CONTROL_WIDTH } as const;

function initial(field: ConfigField, stored: unknown): ConfigValue {
  const raw = stored ?? field.default;
  switch (field.type) {
    case 'bool':
      return raw === true || raw === 'true';
    case 'number': {
      const n = typeof raw === 'number' ? raw : Number(raw);
      return Number.isFinite(n) ? n : 0;
    }
    default:
      if (raw == null) return '';
      if (typeof raw === 'string') return raw;
      if (typeof raw === 'number' || typeof raw === 'boolean') return String(raw);
      return JSON.stringify(raw);
  }
}

export function ModuleConfigForm({
  moduleId,
  fields,
  values,
  onSaved,
}: Readonly<{
  moduleId: string;
  fields: ConfigField[];
  values: Record<string, unknown>;
  onSaved: () => void;
}>) {
  const t = useT();
  const [draft, setDraft] = useState<Record<string, ConfigValue>>(() =>
    Object.fromEntries(fields.map((f) => [f.key, initial(f, values[f.key])])),
  );
  const [saving, setSaving] = useState(false);
  const set = (key: string, v: ConfigValue) => setDraft((d) => ({ ...d, [key]: v }));

  const save = async () => {
    setSaving(true);
    try {
      await adminApi(`/modules/${encodeURIComponent(moduleId)}/config`, {
        method: 'PUT',
        body: JSON.stringify(draft),
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Box mt={12}>
        <Divider />
      </Box>
      <Box gap={8} pt={12}>
        <ListRow.Group size="sm">
          {fields.map((f) => (
            <ConfigRow key={f.key} field={f} value={draft[f.key]} onChange={(v) => set(f.key, v)} />
          ))}
        </ListRow.Group>
        <Row justify="flex-end">
          <Button
            variant="outline"
            active
            size="sm"
            label={t('common.save')}
            onPress={() => void save()}
            loading={saving}
          />
        </Row>
      </Box>
    </>
  );
}

function ConfigRow({
  field,
  value,
  onChange,
}: Readonly<{
  field: ConfigField;
  value: ConfigValue | undefined;
  onChange: (v: ConfigValue) => void;
}>) {
  let control: ReactNode;
  if (field.type === 'bool') {
    control = <Switch checked={value === true} onCheckedChange={onChange} label={field.label} />;
  } else if (field.type === 'select') {
    control = (
      <Select.Root label={field.label} value={String(value ?? '')} onValueChange={onChange}>
        <Select.Trigger style={SELECT_STYLE} />
        {(field.options ?? []).map((opt) => (
          <Select.Item key={opt} value={opt} label={opt} />
        ))}
      </Select.Root>
    );
  } else if (field.type === 'number') {
    control = (
      <NumberField
        label={field.label}
        value={typeof value === 'number' ? value : 0}
        onChange={onChange}
        w={CONTROL_WIDTH}
      />
    );
  } else {
    control = (
      <Field.Root label={field.label} hideLabel w={CONTROL_WIDTH}>
        <Field.Input
          type={field.secret ? 'password' : 'text'}
          placeholder={field.placeholder}
          value={String(value ?? '')}
          onValueChange={onChange}
        />
      </Field.Root>
    );
  }

  return (
    <ListRow.Root size="sm">
      <ListRow.Label>{field.label}</ListRow.Label>
      <ListRow.Trailing>{control}</ListRow.Trailing>
    </ListRow.Root>
  );
}
