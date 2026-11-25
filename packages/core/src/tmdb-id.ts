/** A title's TMDB id as the catalog reports it, or null when TMDB never
 * described the title: the record the server makes for one, such as an
 * episode's or a summary written by hand, carries 0. */
export function tmdbIdOf(id: number | null | undefined): number | null {
  return id != null && id > 0 ? id : null;
}
