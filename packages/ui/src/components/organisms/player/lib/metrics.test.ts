import { describe, expect, it } from 'vitest';
import { TV_FLAGS, WEB_FLAGS } from '../types';
import {
  CARD_MARGIN,
  CLUSTER_GAP,
  CONTROL_SIZE,
  chromeMetrics,
  GUTTER,
  isTransport,
  MIN_SCALE,
  PANEL_FRACTION,
  PANEL_MAX,
  PANEL_MIN,
  panelGeometry,
  px,
  ROW_GAP,
  TRANSPORT_GAP,
  VOLUME_RAIL,
} from './metrics';
import { controlOrder } from './nav';

const WEB = controlOrder({ ...WEB_FLAGS, cast: true }, true);
const TV = controlOrder(TV_FLAGS, true);

/** The width the row would take at design scale, computed the long way round so
 * the test does not simply restate `chromeMetrics`' own arithmetic. */
function designWidth(
  controls: readonly ReturnType<typeof controlOrder>[number][],
  rail = true,
): number {
  const width = (ids: typeof controls, gap: number) =>
    ids.reduce(
      (sum, id) => sum + CONTROL_SIZE[id] + (id === 'volume' && rail ? VOLUME_RAIL : 0),
      0,
    ) +
    Math.max(0, ids.length - 1) * gap;
  return (
    GUTTER * 2 +
    width(
      controls.filter((id) => isTransport(id)),
      TRANSPORT_GAP,
    ) +
    ROW_GAP * 2 +
    width(
      controls.filter((id) => !isTransport(id)),
      CLUSTER_GAP,
    )
  );
}

describe('chromeMetrics', () => {
  it('draws the design at full size on a television stage', () => {
    expect(chromeMetrics(TV, 1920)).toMatchObject({ scale: 1, controls: TV, rail: true });
    expect(chromeMetrics(WEB, 1920)).toMatchObject({ scale: 1, controls: WEB, rail: true });
  });

  it('never scales above the design, however wide the window', () => {
    expect(chromeMetrics(WEB, 5120).scale).toBe(1);
  });

  it('shrinks the row rather than letting the cluster reach the transport', () => {
    const needed = designWidth(WEB);
    const tight = chromeMetrics(WEB, needed - 200);
    expect(tight.scale).toBeLessThan(1);
    expect(tight.scale).toBeGreaterThanOrEqual(MIN_SCALE);
    // Shrinking comes first: nothing has been given up yet.
    expect(tight.controls).toEqual(WEB);
    expect(tight.rail).toBe(true);
    // The whole row still fits the stage it was measured against.
    expect(needed * tight.scale).toBeLessThanOrEqual(needed - 200);
  });

  it('keeps a control set that fits at full size at full size', () => {
    // The same window is comfortable for a TV row and tight for a web one: the
    // scale answers for the controls that are present, not for the platform.
    const width = designWidth(TV) + 10;
    expect(chromeMetrics(TV, width).scale).toBe(1);
    expect(chromeMetrics(WEB, width).scale).toBeLessThan(1);
  });

  it('gives up the volume rail before it gives up size', () => {
    // One pixel under what the full row needs at the floor: the rail goes, and
    // the row that is left grows back rather than shrinking further.
    const railless = chromeMetrics(WEB, Math.round(designWidth(WEB) * MIN_SCALE) - 1);
    expect(railless.rail).toBe(false);
    expect(railless.controls).toEqual(WEB);
    expect(railless.scale).toBeGreaterThan(MIN_SCALE);
  });

  it('sheds controls instead of shrinking past the touch-target floor', () => {
    const phone = chromeMetrics(WEB, 390);
    expect(phone.scale).toBeGreaterThanOrEqual(MIN_SCALE);
    // The floor is what keeps the smallest circle tappable.
    expect(px(phone.scale, CONTROL_SIZE.subtitles)).toBeGreaterThanOrEqual(44);
    // What a phone-width browser keeps: play, the gear that reaches everything
    // shed, and the window control. What it drops is reachable elsewhere.
    expect(phone.controls).toContain('play');
    expect(phone.controls).toContain('settings');
    expect(phone.controls).toContain('fullscreen');
    expect(phone.controls).not.toContain('pip');
    // ...and it is still ONE row: the whole of it fits the stage.
    expect(designWidth(phone.controls, phone.rail) * phone.scale).toBeLessThanOrEqual(390);
  });

  it('reports every shed control, so the panel can offer it', () => {
    // The contract the shedding rests on: what leaves the row is named, in the
    // row's own order, and the two lists together are always the whole row.
    for (const w of [1920, 900, 700, 600, 500, 420, 360, 280]) {
      const m = chromeMetrics(WEB, w);
      expect([...m.controls, ...m.overflow].sort()).toEqual([...WEB].sort());
      expect(m.overflow).toEqual(WEB.filter((id) => !m.controls.includes(id)));
    }
    // Nothing is shed while the row fits - not even when the rail collapses.
    expect(chromeMetrics(WEB, 1920).overflow).toEqual([]);
    const railless = chromeMetrics(WEB, Math.round(designWidth(WEB) * MIN_SCALE) - 1);
    expect(railless.rail).toBe(false);
    expect(railless.overflow).toEqual([]);
    // ...and a phone hands over the ones it dropped, cast among them.
    expect(chromeMetrics(WEB, 390).overflow).toContain('cast');
    expect(chromeMetrics(WEB, 390).overflow).toContain('pip');
  });

  it('sheds the controls the panel reaches before the ones it does not', () => {
    // Walk the whole range and check the order things disappear in: `cast` (the
    // one thing people do from a small window) outlives `audio` and `subtitles`
    // (already rows of the settings panel), which outlive `pip`.
    const widthOf = (id: (typeof WEB)[number]) => {
      for (let w = 240; w <= 1400; w += 2) {
        if (chromeMetrics(WEB, w).controls.includes(id)) return w;
      }
      return Number.POSITIVE_INFINITY;
    };
    expect(widthOf('cast')).toBeLessThan(widthOf('subtitles'));
    expect(widthOf('subtitles')).toBeLessThan(widthOf('audio'));
    expect(widthOf('audio')).toBeLessThan(widthOf('pip'));
  });

  it('keeps the row on one line at every width, down to a phone', () => {
    for (let w = 260; w <= 1920; w += 1) {
      const m = chromeMetrics(WEB, w);
      expect(designWidth(m.controls, m.rail) * m.scale).toBeLessThanOrEqual(w);
      expect(m.scale).toBeGreaterThanOrEqual(MIN_SCALE);
      expect(m.controls).toContain('play');
    }
  });

  it('quantizes the scale so a window drag does not re-lay-out per pixel', () => {
    const needed = designWidth(WEB);
    const steps = new Set<number>();
    for (let w = Math.round(needed * MIN_SCALE); w < needed; w += 1) {
      steps.add(chromeMetrics(WEB, w).scale);
    }
    expect(steps.size).toBeLessThanOrEqual(1 + Math.ceil((1 - MIN_SCALE) / 0.02));
    // ...and every step it does take is a size the row actually fits in.
    for (const scale of steps) expect(scale).toBeGreaterThanOrEqual(MIN_SCALE);
  });

  it('reports the cluster width at the scale it will be drawn at', () => {
    // Against the design's own width rather than a third transcription of the
    // sum: what this asserts is the RULE (whatever the cluster measures, it is
    // reported at the scale it is drawn at), not the arithmetic behind it.
    const design = chromeMetrics(WEB, 1920);
    expect(design.scale).toBe(1);
    const tight = chromeMetrics(WEB, 900);
    expect(tight.scale).toBeLessThan(1);
    // Like for like: 900 is still wide enough for the whole row, so the only
    // difference between the two is the scale.
    expect(tight.controls).toEqual(design.controls);
    expect(tight.rail).toBe(design.rail);
    expect(tight.clusterWidth).toBe(Math.round(design.clusterWidth * tight.scale));
  });

  it('survives a stage it has not been measured on yet', () => {
    // The whole row at full size, not the floor: the first frame is drawn before
    // the stage has reported a width, and it must not flash a shed row.
    expect(chromeMetrics(WEB, 0)).toMatchObject({ scale: 1, controls: WEB, rail: true });
  });
});

describe('panelGeometry', () => {
  it('keeps the design 44% (capped) on a stage with room for it', () => {
    expect(panelGeometry(1920)).toEqual({ width: PANEL_MAX, covers: false });
    expect(panelGeometry(1400).width).toBe(1400 * PANEL_FRACTION);
    expect(panelGeometry(1400).covers).toBe(false);
  });

  it('holds a readable floor rather than shrinking with the stage', () => {
    // 44% of 800 is 352, which set the menu's labels one letter per line.
    expect(panelGeometry(800).width).toBe(PANEL_MIN);
  });

  it('takes the whole stage, and stops shrinking the picture, on a phone', () => {
    const phone = panelGeometry(390);
    expect(phone.width).toBe(390);
    expect(phone.covers).toBe(true);
  });

  it('covers the stage rather than leaving the card no width at all', () => {
    // The band that used to make the picture DISAPPEAR when settings opened.
    // The panel decided it did not need to cover (420 < 540 * 0.8) while the
    // card, which pays 64px of margin on each side, was left 540 - 420 - 128 =
    // -8 and clamped to a scale of 0. The two answers are now computed from the
    // same numbers, so they cannot disagree.
    for (const stage of [526, 540, 548, 600, 650]) {
      const panel = panelGeometry(stage);
      const card = stage - panel.width - CARD_MARGIN * 2;
      expect(panel.covers || card > 0, `stage ${stage}`).toBe(true);
    }
  });

  it('leaves a picture worth looking at whenever it does not cover', () => {
    // Not merely non-zero: below a fifth of the stage it is a postage stamp.
    for (const stage of [700, 834, 960, 1400, 1920, 2560]) {
      const panel = panelGeometry(stage);
      if (panel.covers) continue;
      const card = stage - panel.width - CARD_MARGIN * 2;
      expect(card / stage, `stage ${stage}`).toBeGreaterThanOrEqual(0.2);
    }
  });

  it('covers rather than leaving a slit of film beside it', () => {
    // 420 of a 500 stage is a panel with 80px of picture next to it: take it all.
    const narrow = panelGeometry(500);
    expect(narrow.covers).toBe(true);
    expect(narrow.width).toBe(500);
    // A tablet has room for both, so it keeps the panel and the card.
    expect(panelGeometry(834)).toEqual({ width: PANEL_MIN, covers: false });
  });

  it('never overflows the stage it is drawn on', () => {
    for (const width of [320, 390, 500, 700, 834, 1024, 1280, 1920, 3440]) {
      expect(panelGeometry(width).width).toBeLessThanOrEqual(width);
    }
  });

  it('survives a stage it has not been measured on yet', () => {
    expect(panelGeometry(0)).toEqual({ width: PANEL_MAX, covers: false });
  });
});

describe('px', () => {
  it('rounds, so two circles of the same size are the same size', () => {
    expect(px(0.78, 56)).toBe(44);
    expect(px(1, 56)).toBe(56);
  });
});
