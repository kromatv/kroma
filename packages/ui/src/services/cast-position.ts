import type { CastCommand, CastNowPlaying } from '@kromatv/client/cast';

/** What the position is read from: a roster row, by the few fields that say
 * where its playhead is. */
interface Positioned {
  id: string;
  nowPlaying?: Pick<CastNowPlaying, 'positionMs' | 'durationMs' | 'state'>;
}

/** Where the driven television's playhead was at one moment, and whether it
 * was moving. It is the one source of the position: this sender counts from
 * it, and an order sent from here or a report from the television replaces it
 * whole. */
interface PositionBase {
  id: string;
  positionMs: number;
  playing: boolean;
  at: number;
  /** Set by an order sent from here: until this moment, a report that says
   * another place left the television before the order reached it. */
  heldUntil?: number;
}

const AGREES_WITHIN_MS = 300;
const LANDED_WITHIN_MS = 2000;
const ORDER_LANDS_WITHIN_MS = 4000;

function counted(base: PositionBase, now: number): number {
  return base.positionMs + (base.playing ? Math.max(0, now - base.at) : 0);
}

/** The base a roster row gives, or `null` for a television playing nothing. */
function baseOf(receiver: Positioned, at = Date.now()): PositionBase | null {
  const playing = receiver.nowPlaying;
  if (!playing) {
    return null;
  }
  return {
    id: receiver.id,
    positionMs: playing.positionMs,
    playing: playing.state === 'playing',
    at,
  };
}

function target(command: CastCommand, from: number): number | null {
  if (command.type === 'seek') {
    return command.positionMs;
  }
  return command.type === 'skip' ? Math.max(0, from + command.deltaMs) : null;
}

/** An order sent from here, and the television it went to. */
interface Order {
  receiverId: string;
  command: CastCommand;
}

/** The base after an order sent from here. A seek or a skip puts the playhead
 * where it was sent at once, and holds it there while the order travels; any
 * other order leaves the base as it is. */
function orderedBase(
  base: PositionBase | null,
  { receiverId, command }: Order,
  now = Date.now(),
): PositionBase | null {
  const from = base?.id === receiverId ? counted(base, now) : 0;
  const positionMs = target(command, from);
  if (positionMs === null) {
    return base;
  }
  return {
    id: receiverId,
    positionMs,
    playing: base?.playing ?? true,
    at: now,
    heldUntil: now + ORDER_LANDS_WITHIN_MS,
  };
}

/** The base after the television said where it is.
 *
 * While the count from the base agrees with what it said, the base is kept:
 * each report is late by the time it took to arrive, a different time for each
 * one, so taking every one would move a steady playhead back and forth. A
 * report that disagrees replaces the base. The one exception is a report from
 * far away while an order sent from here is still on its way: it left the
 * television before the order arrived. */
function heardBase(base: PositionBase | null, said: PositionBase | null): PositionBase | null {
  if (!(base && said && base.id === said.id)) {
    return said;
  }
  const apart = Math.abs(counted(base, said.at) - said.positionMs);
  if (apart <= AGREES_WITHIN_MS && base.playing === said.playing) {
    return base;
  }
  const overtaken = said.at < (base.heldUntil ?? 0) && apart > LANDED_WITHIN_MS;
  return overtaken ? base : said;
}

const FINEST_STEP_MS = 16;
const COARSEST_STEP_MS = 100;
const BAR_STEPS = 2000;

/** The smallest move of the playhead worth a redraw, in ms: a two-thousandth
 * of the title, which is finer than a bar's pixels, and never slower than ten
 * redraws a second. A short clip redraws every frame, a film far less. */
function redrawStep(durationMs: number): number {
  if (durationMs <= 0) {
    return COARSEST_STEP_MS;
  }
  return Math.min(COARSEST_STEP_MS, Math.max(FINEST_STEP_MS, durationMs / BAR_STEPS));
}

/** Whether `next` reads differently from `shown`: a step along the bar, or
 * another second on the timecode. */
function showsAnother(shown: number, next: number, step: number): boolean {
  return Math.abs(next - shown) >= step || Math.floor(next / 1000) !== Math.floor(shown / 1000);
}

/** Where the television is now: the count from the base, never past the
 * title's own duration. Before anything was heard for this television, it is
 * where the roster last had it. */
function livePosition(
  active: Positioned | null,
  base: PositionBase | null,
  now = Date.now(),
): number {
  const playing = active?.nowPlaying;
  if (!(base && base.id === active?.id)) {
    return playing?.positionMs ?? 0;
  }
  const position = counted(base, now);
  return playing?.durationMs ? Math.min(position, playing.durationMs) : position;
}

export type { PositionBase };
export { baseOf, heardBase, livePosition, orderedBase, redrawStep, showsAnother };
