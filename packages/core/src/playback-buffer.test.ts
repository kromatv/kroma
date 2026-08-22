import type { MediaFile, MediaItem } from '@kroma/client';
import { describe, expect, it } from 'vitest';
import {
  bufferPlan,
  hlsBufferConfig,
  itemBufferPlan,
  reachableBufferEnd,
  shakaStreamingConfig,
} from './playback-buffer';

function ranges(pairs: [number, number][]): TimeRanges {
  return {
    length: pairs.length,
    start: (i: number) => pairs[i]?.[0] ?? 0,
    end: (i: number) => pairs[i]?.[1] ?? 0,
  } as unknown as TimeRanges;
}

function item(files: Partial<MediaFile>[], over: Partial<MediaItem> = {}): MediaItem {
  return {
    id: 'i1',
    durationMs: 7_200_000,
    files: files as MediaFile[],
    defaultFileId: files[0]?.id,
    ...over,
  } as unknown as MediaItem;
}

describe('bufferPlan', () => {
  it('gives a modest bitrate minutes of buffer', () => {
    const plan = bufferPlan(4_000_000);

    expect(plan.forwardSec).toBe(120);
    expect(plan.backSec).toBe(60);
  });

  it('holds a high bitrate to the bytes a browser will keep', () => {
    const plan = bufferPlan(16_000_000);

    expect(plan.forwardSec).toBe(30);
    expect(plan.forwardSec * (16_000_000 / 8)).toBeLessThanOrEqual(plan.maxBytes);
  });

  it('keeps a floor of buffer even where the byte budget cannot pay for it', () => {
    const plan = bufferPlan(80_000_000);

    expect(plan.forwardSec).toBe(20);
    expect(plan.backSec).toBe(10);
  });

  it('assumes a 1080p web-dl when the bitrate is unknown or nonsense', () => {
    const assumed = bufferPlan(8_000_000);

    expect(bufferPlan(undefined)).toEqual(assumed);
    expect(bufferPlan(null)).toEqual(assumed);
    expect(bufferPlan(0)).toEqual(assumed);
    expect(bufferPlan(-1)).toEqual(assumed);
  });
});

describe('itemBufferPlan', () => {
  it('divides the default file size by its runtime', () => {
    const remux = item([{ id: 'f1', size: 60_000_000_000, durationMs: 7_200_000 }]);

    expect(itemBufferPlan(remux).forwardSec).toBe(20);
  });

  it('prefers the default file over the first one listed', () => {
    const both = item(
      [
        { id: 'f1', size: 60_000_000_000, durationMs: 7_200_000 },
        { id: 'f2', size: 3_000_000_000, durationMs: 7_200_000 },
      ],
      { defaultFileId: 'f2' },
    );

    expect(itemBufferPlan(both).forwardSec).toBe(120);
  });

  it('falls back to the runtime on the item when the file carries none', () => {
    const unprobed = item([{ id: 'f1', size: 14_400_000_000, durationMs: null }]);

    expect(itemBufferPlan(unprobed).forwardSec).toBe(30);
  });

  it('takes the assumed bitrate for an item with no sized file', () => {
    expect(itemBufferPlan(item([])).forwardSec).toBe(bufferPlan(undefined).forwardSec);
    expect(itemBufferPlan(item([{ id: 'f1', size: null }])).forwardSec).toBe(
      bufferPlan(undefined).forwardSec,
    );
  });
});

describe('reachableBufferEnd', () => {
  it('ends at the hole rather than reporting the far side of it', () => {
    expect(
      reachableBufferEnd(
        ranges([
          [0, 30],
          [50, 80],
        ]),
        10,
      ),
    ).toBe(30);
  });

  it('carries across a hole narrow enough for the engines to skip', () => {
    expect(
      reachableBufferEnd(
        ranges([
          [0, 30],
          [30.2, 60],
          [60.4, 90],
        ]),
        0,
      ),
    ).toBe(90);
  });

  it('stops at the first hole too wide to skip', () => {
    expect(
      reachableBufferEnd(
        ranges([
          [0, 30],
          [30.2, 60],
          [70, 90],
        ]),
        0,
      ),
    ).toBe(60);
  });

  it('reads the range that holds the playhead, not the first one', () => {
    expect(
      reachableBufferEnd(
        ranges([
          [0, 30],
          [50, 80],
        ]),
        60,
      ),
    ).toBe(80);
  });

  it('reports nothing reachable while the playhead sits in a hole it cannot skip', () => {
    expect(
      reachableBufferEnd(
        ranges([
          [0, 30],
          [50, 80],
        ]),
        40,
      ),
    ).toBe(0);
  });

  it('reaches a range starting just ahead of the playhead', () => {
    expect(reachableBufferEnd(ranges([[30.3, 90]]), 30)).toBe(90);
  });

  it('reports nothing on an empty buffer or past the end of one', () => {
    expect(reachableBufferEnd(ranges([]), 0)).toBe(0);
    expect(reachableBufferEnd(ranges([[0, 30]]), 90)).toBe(0);
  });
});

describe('engine config', () => {
  it('hands hls.js the plan plus a hole it will step over', () => {
    const plan = bufferPlan(4_000_000);

    const cfg = hlsBufferConfig(plan);

    expect(cfg.maxBufferLength).toBe(plan.forwardSec);
    expect(cfg.maxMaxBufferLength).toBe(plan.forwardSec);
    expect(cfg.maxBufferSize).toBe(plan.maxBytes);
    expect(cfg.backBufferLength).toBe(plan.backSec);
    expect(cfg.maxBufferHole).toBeGreaterThan(0.1);
    expect(cfg.highBufferWatchdogPeriod).toBeLessThan(2);
  });

  it('hands Shaka the plan and a stall detector that gives up waiting sooner', () => {
    const plan = bufferPlan(4_000_000);

    const cfg = shakaStreamingConfig(plan);

    expect(cfg.bufferingGoal).toBe(plan.forwardSec);
    expect(cfg.bufferBehind).toBe(plan.backSec);
    expect(cfg.stallThreshold).toBeLessThan(1);
    expect(cfg.stallSkip).toBeGreaterThan(0.1);
  });

  it('agrees with the readout on what counts as a skippable hole', () => {
    const hole = shakaStreamingConfig(bufferPlan(4_000_000)).gapDetectionThreshold;

    expect(hlsBufferConfig(bufferPlan(4_000_000)).maxBufferHole).toBe(hole);
    expect(reachableBufferEnd(ranges([[hole, 90]]), 0)).toBe(90);
  });
});
