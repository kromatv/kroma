import type { Glyph } from './glyphs';

/** One resolved glyph, ready to draw. */
export interface DrawnGlyphProps {
  Glyph: Glyph;
  size: number;
  color: string;
  /** 1 draws the glyph as is; below it fades the finished glyph in one composite. */
  opacity: number | string;
  thickness: number;
  /** Drawn flipped left for right, for a glyph that points a way in a language
   *  written right to left. */
  mirror?: boolean;
}
