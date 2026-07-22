// "Media details" modal (admin): the technical truth about the file(s) backing
// one catalog item path, container, size, duration, and every video / audio /
// subtitle stream ffprobe found. All of this already rides on the item DTO the
// fiche loaded, so the modal reads from cache and adds no request.

import type { MediaFile, MediaItem } from '@kroma/core';
import { useT } from '@kroma/ui';
import { IconLoader2, IconX } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { createCallable } from 'react-call';
import { FileCard } from '#web/features/catalog/media-info-card';
import { catalogQueries } from '#web/shared/lib/queries';

// Open with `await MediaInfoModal.call({ id, title })`; read-only, so it resolves
// (`void`) purely on dismiss. Its root is mounted once by `CatalogModalHosts`.
export const MediaInfoModal = createCallable<{ id: string; title: string }, void>(
  ({ call, id, title }) => {
    const t = useT();
    // Cached: the fiche already loaded this item, so this resolves instantly.
    const { data: item, isPending } = useQuery(catalogQueries.item(id));
    const files = item ? filesOf(item) : [];

    return (
      <>
        <button
          type="button"
          aria-label={t('common.close')}
          onClick={() => call.end()}
          className="fixed inset-0 z-60 bg-[rgba(4,4,6,.66)] backdrop-blur-[3px]"
        />
        <div className="pointer-events-none fixed inset-0 z-61 flex items-center justify-center p-4">
          <section className="pointer-events-auto flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0E0E12] shadow-[0_30px_90px_rgba(0,0,0,.6)]">
            <header className="flex items-start justify-between gap-4 border-b border-white/[0.07] px-7 py-5">
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-[.14em] text-white/40">
                  {t('mediaInfo.title')}
                </div>
                <h2 className="mt-1 truncate font-display text-[20px] font-bold">{title}</h2>
              </div>
              <button
                type="button"
                onClick={() => call.end()}
                aria-label={t('common.close')}
                className="shrink-0 rounded-xl border border-white/9 bg-[#15151A] px-2.5 py-2 text-white/60 hover:bg-[#1a1a20] hover:text-white"
              >
                <IconX size={18} stroke={2.1} />
              </button>
            </header>

            <div className="flex-1 space-y-5 overflow-y-auto px-7 py-5">
              {isPending ? (
                <div className="flex justify-center py-16 text-white/40">
                  <IconLoader2 size={26} stroke={2.2} className="animate-spin" />
                </div>
              ) : null}
              {!isPending && files.length === 0 ? (
                <p className="py-16 text-center text-[13px] text-white/40">
                  {t('mediaInfo.noFile')}
                </p>
              ) : null}
              {files.map((f, i) => (
                <FileCard key={f.id} file={f} index={i} multi={files.length > 1} />
              ))}
            </div>
          </section>
        </div>
      </>
    );
  },
);

/** The item's physical files, or a synthetic one from the top-level fields for
 * legacy rows that predate the per-file list. */
function filesOf(item: MediaItem): MediaFile[] {
  if (item.files.length) return item.files;
  return [
    {
      id: item.id,
      relPath: item.relPath ?? null,
      container: item.container,
      durationMs: item.durationMs ?? null,
      video: item.video ?? null,
      audio: item.audio ?? null,
      audioTracks: item.audioTracks ?? [],
      subtitles: item.subtitles ?? [],
      size: null,
      edition: null,
      probed: item.video != null,
    },
  ];
}
