export interface BarListProps {
  title: string;
  /** Already sorted and floored by the collector; rendered in the order given. */
  counts: readonly { key: string; n: number }[];
  empty: string;
  /** Rows beyond this fold into one "other" row rather than growing the list. */
  max?: number;
  otherLabel: string;
  /** Applied to a key from the collector, never to the "other" row's label. */
  format?: (key: string) => string;
}

const DEFAULT_MAX = 8;

export function BarList({
  title,
  counts,
  empty,
  max = DEFAULT_MAX,
  otherLabel,
  format,
}: Readonly<BarListProps>) {
  const shown = counts.slice(0, max);
  const rest = counts.slice(max).reduce((sum, { n }) => sum + n, 0);
  const rows: { key: string; label: string; n: number }[] = shown.map(({ key, n }) => ({
    key,
    label: format ? format(key) : key,
    n,
  }));
  // The fold-up row is a label, not a key, so it never reaches `format`: the
  // formatters here are `Intl.DisplayNames`, which throws on anything that is
  // not a well-formed code.
  if (rest > 0) rows.push({ key: otherLabel, label: otherLabel, n: rest });
  const top = rows.reduce((peak, { n }) => Math.max(peak, n), 0);

  return (
    <section className="rounded-2xl border border-border bg-surface-1 p-6">
      <h3 className="font-display text-lg font-bold text-text">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-muted">{empty}</p>
      ) : (
        <ul className="mt-5 flex flex-col gap-3">
          {rows.map(({ key, label, n }) => (
            <li key={key} className="flex items-center gap-3">
              <span className="w-32 shrink-0 truncate text-sm text-muted" title={label}>
                {label}
              </span>
              <span className="h-2 grow overflow-hidden rounded-full bg-wash">
                <span
                  className="block h-full rounded-full bg-accent"
                  style={{ width: `${Math.max(2, Math.round((n / top) * 100))}%` }}
                />
              </span>
              <span className="w-10 shrink-0 text-right text-sm text-text tabular-nums">{n}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
