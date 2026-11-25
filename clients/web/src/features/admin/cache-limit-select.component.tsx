import { useLocale, useT } from '@kromatv/ui';
import { formatGigabytes } from '@kromatv/ui/intl';
import { Select } from '@kromatv/ui/kit';

function gigabytesOf(limit: string): number | null {
  const lead = /^[\d.]+/.exec(limit.trim());
  const gigabytes = lead ? Number(lead[0]) : Number.NaN;
  return gigabytes > 0 ? gigabytes : null;
}

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
  const locale = useLocale();
  const unlimited = t('opt.unlimited');
  const selected = gigabytesOf(value) === null ? unlimited : value;
  const offered = [...sizes, unlimited];
  const all = offered.includes(selected) ? offered : [selected, ...offered];
  const nameOf = (limit: string) => {
    const gigabytes = gigabytesOf(limit);
    return gigabytes === null ? unlimited : formatGigabytes(gigabytes, locale);
  };
  return (
    <Select.Root label={label} value={selected} onValueChange={onChange}>
      <Select.Trigger />
      {all.map((limit) => (
        <Select.Item key={limit} value={limit} label={nameOf(limit)} />
      ))}
    </Select.Root>
  );
}
