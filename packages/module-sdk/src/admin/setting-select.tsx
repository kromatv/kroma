import { Select } from '@kromatv/ui/kit';

/** Keeps the current value selectable even if it isn't in the list, so a
 * stored setting the schema no longer names still shows. */
export function SettingSelect({
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
