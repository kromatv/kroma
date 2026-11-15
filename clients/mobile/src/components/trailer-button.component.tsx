import type { TmdbKind } from '@kromatv/client/discovery';
import { Button } from '@kromatv/ui/kit';
import { useTrailerLink } from '#mobile/lib/use-trailer-link.hook';

export function TrailerButton({
  kind,
  tmdbId,
  title,
}: Readonly<{ kind: TmdbKind; tmdbId: number | null | undefined; title: string }>) {
  const trailer = useTrailerLink(kind, tmdbId, title);
  if (!trailer) {
    return null;
  }
  return <Button variant="outline" icon="movie" label={trailer.label} onPress={trailer.open} />;
}
