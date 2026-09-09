export interface StatTileProps {
  label: string;
  value: string;
  hint?: string;
}

export function StatTile({ label, value, hint }: Readonly<StatTileProps>) {
  return (
    <div className="rounded-2xl border border-border bg-surface-1 p-6">
      <p className="font-sans text-xs font-bold uppercase tracking-[0.18em] text-dim">{label}</p>
      <p className="mt-3 font-display text-4xl font-extrabold leading-none text-text tabular-nums sm:text-5xl">
        {value}
      </p>
      {hint && <p className="mt-2 text-sm text-muted">{hint}</p>}
    </div>
  );
}
