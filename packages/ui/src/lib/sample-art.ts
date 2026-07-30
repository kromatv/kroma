// Sample artwork for the workbench, and ONLY for the workbench.
//
// Real photographs rather than `art={null}`: a placeholder gradient leaves
// PosterCard, MediaCard and Img all looking like empty boxes, hiding the one
// thing those components exist to show.
//
// From Lorem Picsum (which serves Unsplash-licensed images), pinned by `seed`
// so a given tile always gets the same picture: a workbench whose artwork
// reshuffles on every reload makes visual comparison impossible. No film
// posters - nothing licensed to a studio belongs in a repo.
//
// They are URLs rather than files in the repo because the kit's `src` prop is a
// STRING. Metro's `require` of a .jpg yields an opaque asset id, not a string,
// so a committed file would work on the web and break on the native workbench.
//
// The cost is honest: with no network the stories fall back to `<Img>`'s
// gradient placeholder, which is exactly what that placeholder is for.

const PICSUM = 'https://picsum.photos/seed';

/** Portrait artwork, 2:3, for posters. */
const POSTER_ART = [
  `${PICSUM}/kroma-poster-1/300/450`,
  `${PICSUM}/kroma-poster-2/300/450`,
  `${PICSUM}/kroma-poster-3/300/450`,
  `${PICSUM}/kroma-poster-4/300/450`,
  `${PICSUM}/kroma-poster-5/300/450`,
  `${PICSUM}/kroma-poster-6/300/450`,
] as const;

/** Landscape artwork, 16:9, for thumbnails, hero backdrops and `<Img>`. */
const STILL_ART = [
  `${PICSUM}/kroma-still-1/640/360`,
  `${PICSUM}/kroma-still-2/640/360`,
  `${PICSUM}/kroma-still-3/640/360`,
  `${PICSUM}/kroma-still-4/640/360`,
  `${PICSUM}/kroma-still-5/640/360`,
  `${PICSUM}/kroma-still-6/640/360`,
] as const;

/** Stable pick, so a story that renders a grid gets variety without randomness
 * (and so two runs of the screenshot script frame the same images). */
function posterArt(at: number): string {
  return POSTER_ART[at % POSTER_ART.length] as string;
}

function stillArt(at: number): string {
  return STILL_ART[at % STILL_ART.length] as string;
}

export { POSTER_ART, posterArt, STILL_ART, stillArt };
