import { useT } from '@kromatv/ui';
import { Select } from '@kromatv/ui/kit';
import { useCacheLimitName } from './cache-limit-name.hook';

/** A cache budget picker. Each limit is stored as the server reads it
 *  (`"40 Go"`, any other word for no limit) and shown in the reader's units. */
export function CacheLimitSelect({
  label,
  value,
  sizes,
  onChange,
}: Readonly<{
  label: string;
  value: string;
  sizes: readonly string[];
  onChange: (limit: string) => void;
}>) {
  const t = useT();
  const nameOf = useCacheLimitName();
  const unlimited = t('opt.unlimited');
  const selected = nameOf(value) === unlimited ? unlimited : value;
  const offered = [...sizes, unlimited];
  const all = offered.includes(selected) ? offered : [selected, ...offered];
  return (
    <Select.Root label={label} value={selected} onValueChange={onChange}>
      <Select.Trigger />
      {all.map((limit) => (
        <Select.Item key={limit} value={limit} label={nameOf(limit)} />
      ))}
    </Select.Root>
  );
}
