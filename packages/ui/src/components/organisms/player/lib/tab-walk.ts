import type { ControlId, Zone } from './nav';

export type TabStop =
  | { zone: 'back' }
  | { zone: 'resume' }
  | { zone: 'progress' }
  | { zone: 'controls'; control: ControlId }
  | { zone: 'sheet' };

export interface TabWalk {
  zone: Zone;
  control: ControlId | null;
  drawnControls: readonly ControlId[];
  sheetHasItems: boolean;
  resumeShown: boolean;
}

const BACK = 0;

function stopsOf(at: TabWalk): TabStop[] {
  const stops: TabStop[] = [{ zone: 'back' }];
  if (at.resumeShown) stops.push({ zone: 'resume' });
  stops.push({ zone: 'progress' });
  for (const control of at.drawnControls) stops.push({ zone: 'controls', control });
  if (at.sheetHasItems) stops.push({ zone: 'sheet' });
  return stops;
}

function indexOf(at: TabWalk): number {
  const progress = BACK + (at.resumeShown ? 2 : 1);
  if (at.zone === 'back') return BACK;
  if (at.zone === 'resume') return BACK + 1;
  if (at.zone === 'progress') return progress;
  const control = at.control ?? at.drawnControls[0] ?? 'play';
  return progress + 1 + Math.max(0, at.drawnControls.indexOf(control));
}

export function nextTabStop(at: TabWalk, backwards: boolean): TabStop | null {
  return stopsOf(at)[indexOf(at) + (backwards ? -1 : 1)] ?? null;
}
