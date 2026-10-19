import type { Glyph } from './glyphs';

/** One resolved glyph, ready to draw. */
export interface DrawnGlyphProps {
  Glyph: Glyph;
  size: number;
  color: string;
  /** 1 draws the glyph as is; below it fades the finished glyph in one composite. */
  opacity: number | string;
  thickness: number;
}
