import { getLocale } from '#site/lib/i18n';

export interface BarListProps {
  title: string;
  /** Already sorted by the collector; rendered in the order given. */
  counts: readonly { key: string; n: number }[];
  /** The servers the list is over. With it, a row also shows its share of them. */
  total?: number;
  empty: string;
  /** Rows beyond this fold into one "other" row rather than growing the list. */
  max?: number;
  otherLabel: string;
  /** Applied to a key from the collector, never to the "other" row's label. */
  format?: (key: string) => string;
  /** An image to show before a key's label, where one is known. */
  icon?: (key: string) => string | null | undefined;
  /** A `flag` is drawn 3:2 with tight corners; a `square` icon fills a rounded box. */
  iconShape?: 'square' | 'flag';
  /** Says which servers this list is over, when that is fewer than all of them. */
  footnote?: string;
}

const DEFAULT_MAX = 8;
const MIN_BAR_PERCENT = 2;

/** One ranked breakdown: a title, a bar per row, and the share of the servers
 * it is over. Chrome-less, so a caller decides whether it stands in its own
 * card or shares one. */
export function BarList({
  title,
  counts,
  total,
  empty,
  max = DEFAULT_MAX,
  otherLabel,
  format,
  icon,
  iconShape = 'square',
  footnote,
}: Readonly<BarListProps>) {
  const locale = getLocale();
  const shown = counts.slice(0, max);
  const rest = counts.slice(max).reduce((sum, { n }) => sum + n, 0);
  const rows = shown.map(({ key, n }) => ({
    key,
    label: format ? format(key) : key,
    icon: icon?.(key) ?? null,
    n,
    other: false,
  }));
  // The fold-up row is a label, not a key, so it never reaches `format`: the
  // formatters here are `Intl.DisplayNames`, which throws on anything that is
  // not a well-formed code.
  if (rest > 0) rows.push({ key: otherLabel, label: otherLabel, icon: null, n: rest, other: true });
  const peak = rows.reduce((top, { n }) => Math.max(top, n), 0);
  const percent = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 });

  return (
    <section className="flex min-w-0 flex-col">
      <h3 className="font-display text-base font-bold text-text">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted">{empty}</p>
      ) : (
        <ol className="mt-4 flex flex-col gap-2.5">
          {rows.map((row) => (
            <li
              key={row.key}
              className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3"
            >
              <span
                className={`flex min-w-0 items-center gap-2 text-sm ${row.other ? 'text-dim' : 'text-text'}`}
                title={row.label}
              >
                {row.icon && (
                  <img
                    src={row.icon}
                    alt=""
                    aria-hidden
                    width={iconShape === 'flag' ? 21 : 18}
                    height={iconShape === 'flag' ? 14 : 18}
                    className={
                      iconShape === 'flag'
                        ? 'h-3.5 w-[21px] shrink-0 rounded-[3px] object-cover'
                        : 'size-[18px] shrink-0 rounded-md'
                    }
                  />
                )}
                <span className="truncate">{row.label}</span>
              </span>
              <span className="h-1.5 overflow-hidden rounded-full bg-wash">
                <span
                  className={`block h-full rounded-full ${row.other ? 'bg-border-strong' : 'bg-accent-wash'}`}
                  style={{
                    width: `${Math.max(MIN_BAR_PERCENT, Math.round((row.n / peak) * 100))}%`,
                  }}
                />
              </span>
              <span className="text-right text-sm tabular-nums">
                <span className="text-text">{row.n.toLocaleString(locale)}</span>
                {total !== undefined && total > 0 && (
                  <span className="ml-2 inline-block w-9 text-dim">
                    {percent.format(row.n / total)}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ol>
      )}
      {footnote && <p className="mt-4 text-xs text-dim">{footnote}</p>}
    </section>
  );
}
