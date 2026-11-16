import { numeralColumn, RAIL_GAP } from '@kromatv/ui/kit';

export const RAIL_LIMIT = 20;

// A rail tile is drawn 330pt wide, but the server's next rendition bucket above
// 320 is 480: those pixels cost more than the 3% upscale shows.
export const TILE_ART_W = 320;

// What one home tile occupies, so the row can be virtualised: a <MediaCard>
// at its default 328 width, 16:9, plus the gap after it.
export const ROW_TILE = { pitch: 328 + RAIL_GAP, height: Math.round((328 * 9) / 16) };

const RANKED_POSTER_W = 170;
const RANKED_POSTER_H = Math.round((RANKED_POSTER_W * 3) / 2);

export const RANK_H = Math.round(RANKED_POSTER_H * 0.72);
export const RANK_TUCK = 22;
export const RANK_COLUMN = numeralColumn(RANK_H, 4);
export const RANK_W = RANK_COLUMN - RANK_TUCK;

export const RANKED_TILE = {
  pitch: RANK_W + RANKED_POSTER_W + RAIL_GAP,
  height: RANKED_POSTER_H,
};
