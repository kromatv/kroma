import { Box, Field, Select, Text } from '@kromatv/ui/kit';
import type { ReactNode } from 'react';
import { factLabel } from './fact-labels';
import { NOT_LISTED } from './not-listed';

export function Entry({
  label,
  placeholder,
  value,
  onPick,
}: Readonly<{
  label: string;
  placeholder: string;
  value: string;
  onPick: (next: string) => void;
}>) {
  return (
    <Field.Root label={label} size="sm" value={value} onValueChange={onPick}>
      <Field.Input placeholder={placeholder} />
    </Field.Root>
  );
}

export function Count({
  label,
  placeholder,
  value,
  onPick,
}: Readonly<{
  label: string;
  placeholder: string;
  value: number | null | undefined;
  onPick: (next: number | null) => void;
}>) {
  return (
    <Field.Root
      label={label}
      size="sm"
      value={value == null ? '' : String(value)}
      onValueChange={(text) => onPick(readCount(text))}
    >
      <Field.Input type="number" placeholder={placeholder} />
    </Field.Root>
  );
}

function readCount(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export function Choice<Option extends string>({
  label,
  anyLabel,
  options,
  value,
  onPick,
}: Readonly<{
  label: string;
  anyLabel?: string;
  options: readonly Option[];
  value: Option | null;
  onPick: (next: Option | null) => void;
}>) {
  return (
    <Labelled label={label}>
      <Select.Root
        label={label}
        value={value ?? NOT_LISTED}
        onValueChange={(next) => onPick(options.find((option) => option === next) ?? null)}
      >
        <Select.Trigger size="sm" block />
        {anyLabel ? <Select.Item value={NOT_LISTED} label={anyLabel} /> : null}
        {options.map((option) => (
          <Select.Item key={option} value={option} label={factLabel(option)} />
        ))}
      </Select.Root>
    </Labelled>
  );
}

export function Labelled({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <Box gap={6}>
      <Text variant="meta" color="textMuted">
        {label}
      </Text>
      {children}
    </Box>
  );
}
