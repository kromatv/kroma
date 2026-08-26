export interface BarListProps {
  title: string;
  /** Already sorted and floored by the collector; rendered in the order given. */
  counts: Record<string, number>;
  empty: string;
  /** Rows beyond this fold into one "other" row rather than growing the list. */
  max?: number;
  otherLabel: string;
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
  const entries = Object.entries(counts);
  const shown = entries.slice(0, max);
  const rest = entries.slice(max).reduce((sum, [, n]) => sum + n, 0);
  const rows = rest > 0 ? [...shown, [otherLabel, rest] as const] : shown;
  const top = rows.reduce((peak, [, n]) => Math.max(peak, n), 0);

  return (
    <section className="rounded-2xl border border-border bg-surface-1 p-6">
      <h3 className="font-display text-lg font-bold text-text">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-muted">{empty}</p>
      ) : (
        <ul className="mt-5 flex flex-col gap-3">
          {rows.map(([key, n]) => (
            <li key={key} className="flex items-center gap-3">
              <span className="w-32 shrink-0 truncate text-sm text-muted" title={key}>
                {format ? format(key) : key}
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
