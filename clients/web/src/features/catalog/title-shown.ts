/** What a title's page shows before anything is written by hand: the text and
 * the pictures read beside its files or fetched from TMDB. The dialogs that
 * change a title show it where nothing was written or uploaded. */
export interface TitleShown {
  title: string;
  originalTitle: string | null;
  tagline: string | null;
  year: number | null;
  overview: string | null;
  genres: readonly string[];
  poster: string | null;
  backdrop: string | null;
}
