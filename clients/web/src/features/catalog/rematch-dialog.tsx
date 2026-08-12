// "Fix the TMDB match" modal: the ranked TMDB candidates for one catalog
// element, as a scannable poster grid with the matcher's confidence for each.
// Applying a choice re-runs the metadata stage in the background, so the modal
// closes on an ack rather than waiting for the new art (the fiche live-refreshes
// on the update event). Gated on `library.manage` by the caller AND the server.

import { apiErrorText } from '@kroma/core';
import { useT } from '@kroma/ui';
import { Box, Button, Callout, Field, IconButton, Spinner, Text } from '@kroma/ui/kit';
import { useQuery } from '@tanstack/react-query';
import { type CSSProperties, useState } from 'react';
import { createCallable } from 'react-call';
import {
  FOOTER_RULE,
  HEADER_RULE,
  MODAL_BODY,
  MODAL_LAYER,
  modalPanel,
} from '#web/features/catalog/modal-shell';
import { CandidateCard } from '#web/features/catalog/rematch-card';
import { TileGrid } from '#web/features/catalog/tile-grid';
import { useAuth } from '#web/shared/lib/auth';
import { MODAL_SCRIM } from '#web/shared/ui';

type Kind = 'movie' | 'show';

const PANEL = modalPanel(1024);
const SEARCH_FORM: CSSProperties = { display: 'flex', flexShrink: 0, gap: 8 };
const SEARCH_BOX: CSSProperties = { width: 220, maxWidth: '42vw' };

// Open with `await RematchDialog.call({ kind, id, title })`. Resolves `true`
// once a correction is queued, `false` on dismiss. Mounted by `CatalogModalHosts`.
export const RematchDialog = createCallable<{ kind: Kind; id: string; title: string }, boolean>(
  ({ call, kind, id, title }) => {
    const t = useT();
    const { client } = useAuth();
    // `submitted` drives the request; `undefined` means "search the parsed title",
    // which is what the modal opens with. Typing alone does not refetch.
    const [submitted, setSubmitted] = useState<string | undefined>(undefined);
    // `null` = untouched, so the box can show whatever the server searched for.
    const [typed, setTyped] = useState<string | null>(null);
    const [applying, setApplying] = useState<number | 'reset' | null>(null);
    const [applyError, setApplyError] = useState<string | null>(null);

    const {
      data,
      isPending,
      error: loadError,
    } = useQuery({
      queryKey: ['rematch', kind, id, submitted ?? ''] as const,
      queryFn: () => client.matchCandidates(kind, id, submitted),
      // TMDB search is a live third-party call; a stale candidate list is useless.
      staleTime: 0,
    });

    const query = typed ?? data?.query ?? '';

    const apply = (tmdbId: number | null) => {
      setApplying(tmdbId ?? 'reset');
      setApplyError(null);
      client
        .setMatch(kind, id, tmdbId)
        .then(() => call.end(true))
        .catch((e) => setApplyError(apiErrorText(e, t('rematch.applyFailed'))))
        .finally(() => setApplying(null));
    };

    const error =
      applyError ?? (loadError ? apiErrorText(loadError, t('rematch.loadFailed')) : null);

    return (
      <>
        <button
          type="button"
          aria-label={t('common.close')}
          onClick={() => call.end(false)}
          className={MODAL_SCRIM}
        />
        <div style={MODAL_LAYER}>
          <section style={PANEL}>
            <Box row align="flex-start" between gap={16} px={28} py={20} style={HEADER_RULE}>
              <Box minW={0}>
                <Text variant="overline" color="white/40">
                  {t('rematch.title')}
                </Text>
                <h2>
                  <Text variant="h2" mt={4} lines={1}>
                    {title}
                  </Text>
                </h2>
                {data?.year != null ? (
                  <Text variant="meta" color="white/45" mt={2}>
                    {t('rematch.parsedAs', { title: `${data.query} (${data.year})` })}
                  </Text>
                ) : null}
              </Box>
              <form
                style={SEARCH_FORM}
                onSubmit={(e) => {
                  e.preventDefault();
                  setSubmitted(query.trim() || undefined);
                }}
              >
                <div style={SEARCH_BOX}>
                  <Field.Root label={t('rematch.searchPlaceholder')} hideLabel>
                    <Field.Input
                      type="search"
                      icon="search"
                      value={query}
                      onValueChange={setTyped}
                      onSubmit={() => setSubmitted(query.trim() || undefined)}
                      placeholder={t('rematch.searchPlaceholder')}
                    />
                  </Field.Root>
                </div>
                {/* Mirrors the form's implicit Enter-key submit. */}
                <IconButton
                  control="sm"
                  icon="search"
                  label={t('rematch.search')}
                  onPress={() => setSubmitted(query.trim() || undefined)}
                  disabled={isPending}
                />
                <IconButton
                  control="sm"
                  icon="x"
                  label={t('common.close')}
                  onPress={() => call.end(false)}
                />
              </form>
            </Box>

            <div style={MODAL_BODY}>
              {error ? (
                <Callout.Root tone="danger">
                  <Callout.Title>{error}</Callout.Title>
                </Callout.Root>
              ) : null}
              {isPending ? (
                <Box align="center" py={64}>
                  <Spinner size={26} color="white/40" />
                </Box>
              ) : null}
              {!isPending && data?.results.length === 0 ? (
                <Text variant="meta" color="white/40" textAlign="center" py={64}>
                  {t('rematch.noResults')}
                </Text>
              ) : null}
              {!isPending && (data?.results.length ?? 0) > 0 ? (
                <TileGrid>
                  {() =>
                    (data?.results ?? []).map((c) => (
                      <CandidateCard
                        key={c.tmdbId}
                        candidate={c}
                        busy={applying === c.tmdbId}
                        disabled={applying !== null}
                        onPick={() => apply(c.tmdbId)}
                      />
                    ))
                  }
                </TileGrid>
              ) : null}
            </div>

            {data?.pinned ? (
              <Box px={28} py={16} style={FOOTER_RULE}>
                <Button
                  block
                  variant="glass"
                  size="sm"
                  label={t('rematch.reset')}
                  onPress={() => apply(null)}
                  loading={applying === 'reset'}
                  disabled={applying !== null && applying !== 'reset'}
                />
              </Box>
            ) : null}
          </section>
        </div>
      </>
    );
  },
);
