import { useLocale, useT } from '@kroma/ui';
import { Button, IconButton } from '@kroma/ui/kit';
import { IconCheck } from '@tabler/icons-react';
import { useState } from 'react';
import { RequestStatusChip } from '#web/features/requests/request-status-chip';
import type { TitleSeason } from '#web/shared/lib/titleView';
import { DRAWER_SCRIM } from '#web/shared/ui';

export function SeasonPicker({
  seasons,
  title,
  busy,
  initial,
  onClose,
  onRequest,
}: Readonly<{
  seasons: TitleSeason[];
  title: string;
  busy: boolean;
  initial?: number[];
  onClose: () => void;
  onRequest: (seasons: number[] | null) => void;
}>) {
  const t = useT();
  const open = seasons.filter((s) => !s.available && !s.requested);
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(initial ?? open.map((s) => s.number)),
  );

  const toggle = (season: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(season)) next.delete(season);
      else next.add(season);
      return next;
    });
  };
  const allOpen = open.length > 0 && open.every((s) => selected.has(s.number));
  const toggleAll = () => setSelected(allOpen ? new Set() : new Set(open.map((s) => s.number)));

  const submit = () => {
    const all = seasons.length === selected.size && open.length === seasons.length;
    onRequest(all ? null : Array.from(selected).sort((a, b) => a - b));
  };

  return (
    <>
      <button
        type="button"
        aria-label={t('common.close')}
        onClick={onClose}
        className={DRAWER_SCRIM}
      />
      <aside className="fixed right-0 top-0 z-61 flex h-screen w-[420px] max-w-[92vw] flex-col border-l border-white/9 bg-bg shadow-[-20px_0_60px_rgba(0,0,0,.6)]">
        <div className="flex items-center justify-between border-b border-white/[0.07] px-6 py-5">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[.14em] text-white/40">
              {t('discover.requestSeasons')}
            </div>
            <h2 className="mt-1 font-display text-[19px] font-bold">{title}</h2>
          </div>
          <IconButton variant="ghost" icon="x" label={t('common.close')} onPress={onClose} />
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {open.length > 1 ? (
            <button
              type="button"
              onClick={toggleAll}
              className="mb-2 flex w-full items-center gap-3 rounded-xl border border-white/8 bg-surface-1 px-4 py-3 text-left"
            >
              <Box on={allOpen} />
              <span className="text-[14px] font-bold">{t('discover.allSeasons')}</span>
            </button>
          ) : null}
          {seasons.map((s) => (
            <SeasonRow
              key={s.number}
              s={s}
              checked={selected.has(s.number)}
              onToggle={() => toggle(s.number)}
            />
          ))}
        </div>

        <div className="border-t border-white/[0.07] px-6 py-4.5">
          <Button
            block
            label={t('discover.requestN', { n: String(selected.size) })}
            onPress={submit}
            loading={busy}
            disabled={selected.size === 0}
          />
        </div>
      </aside>
    </>
  );
}

function SeasonRow({
  s,
  checked,
  onToggle,
}: Readonly<{ s: TitleSeason; checked: boolean; onToggle: () => void }>) {
  const t = useT();
  const locale = useLocale();
  const locked = s.available || s.requested;
  const today = new Date().toISOString().slice(0, 10);
  const upcoming =
    s.airDate && s.airDate > today
      ? new Date(`${s.airDate}T00:00:00`).toLocaleDateString(locale)
      : null;
  return (
    <button
      type="button"
      disabled={locked}
      onClick={onToggle}
      className={`mb-2 flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left ${locked ? 'border-white/5 bg-bg opacity-70' : 'border-white/8 bg-surface-1 hover:bg-surface-2'}`}
    >
      {locked ? (
        <span className="flex-[0_0_auto]">
          <RequestStatusChip status={s.available ? 'available' : 'pending'} size="card" />
        </span>
      ) : (
        <Box on={checked} />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-bold">
          {s.name ?? t('discover.seasonN', { n: String(s.number) })}
        </span>
        <span className="block text-[12px] font-medium text-white/45">
          {t('discover.episodesN', { n: String(s.episodeCount) })}
        </span>
        {upcoming ? (
          <span className="mt-0.5 block text-[11.5px] font-semibold text-accent">
            {t('requests.availableDate', { date: upcoming })}
          </span>
        ) : null}
      </span>
    </button>
  );
}

function Box({ on }: Readonly<{ on: boolean }>) {
  return (
    <span
      className={`flex h-5 w-5 flex-[0_0_20px] items-center justify-center rounded-md border ${on ? 'border-accent bg-accent text-accent-ink' : 'border-white/25'}`}
    >
      {on ? <IconCheck size={13} stroke={3} /> : null}
    </span>
  );
}
