import type { TmdbKind } from '@kromatv/client/discovery';
import { TRAILER_LABEL } from '@kromatv/core';
import { useT } from '@kromatv/ui';
import { Button, FocusRegion, styles, useStyles } from '@kromatv/ui/kit';
import type { ReactNode } from 'react';
import { useNav } from '#tv/app/router';
import { usePlayableTrailer } from '#tv/features/catalog/detail/usePlayableTrailer';

interface TrailerTarget {
  kind: TmdbKind;
  tmdbId: number | null | undefined;
  title: string;
}

/** Opens the title's trailer. Renders nothing until the server says it can play
 * one, and is labelled by how that trailer reaches the viewer. */
export function TrailerButton({
  kind,
  tmdbId,
  title,
  autoFocus,
}: Readonly<TrailerTarget & { autoFocus?: boolean }>) {
  const t = useT();
  const nav = useNav();
  const trailer = usePlayableTrailer(kind, tmdbId);
  if (!trailer || tmdbId == null) return null;
  return (
    <Button
      variant="outline"
      size="lg"
      icon="movie"
      autoFocus={autoFocus}
      label={t(TRAILER_LABEL[trailer.version])}
      onPress={() => nav.go('trailer', { kind, tmdbId, title, trailer })}
    />
  );
}

/** The head of a detail screen's action row: its primary button, then the
 * title's trailer. A group of their own, so a trailer button that arrives after
 * the row has mounted still sits next to the primary on the remote rather than
 * at the row's far end. */
export function LeadActions({
  trailer,
  children,
}: Readonly<{ trailer: TrailerTarget; children: ReactNode }>) {
  const s = useStyles(sDefinition);
  return (
    <FocusRegion style={s.lead}>
      {children}
      <TrailerButton kind={trailer.kind} tmdbId={trailer.tmdbId} title={trailer.title} />
    </FocusRegion>
  );
}

const sDefinition = styles({
  lead: { row: true, align: 'center', gap: 16 },
});
