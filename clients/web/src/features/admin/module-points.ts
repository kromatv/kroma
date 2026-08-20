// The extension-point graph, derived from the installed manifests. A module
// declares the points it invents (`definesPoints`), answers one through
// `contributes` (with an instance id, when several can answer at once), and calls
// one through `consumes`.

import type { AdminModule } from '#web/features/admin/module-api';

/** One module answering a point. */
export interface Answer {
  moduleId: string;
  name: string;
  /** The instance it answers under, when the point takes several. */
  instance?: string;
  /** Enabled AND running, so the point actually resolves to it. */
  live: boolean;
}

/** One module calling a point. */
export interface Caller {
  moduleId: string;
  name: string;
  /** Set when it asked for one specific instance rather than any. */
  instance?: string;
}

/** One point: its full name, who defined it, who answers it, and who calls it. */
export interface Point {
  name: string;
  /** The module that invented it, when one installed here declares it. A point
   *  whose definer is absent still shows: something answers or calls it. */
  definedBy?: string;
  /** The major the definer serves, for spotting a contributor built against
   *  another one. */
  version?: number;
  answers: Answer[];
  callers: Caller[];
  /** Somebody calls this and nothing live answers, so those callers are inert. */
  unanswered: boolean;
}

// A module with no process of its own is never "running": its code is co-linked
// into another sidecar, so treating it as down would be a false alarm.
function isLive(m: AdminModule): boolean {
  return m.enabled && (!m.hasSidecar || m.running);
}

/** Every point the installed modules between them declare, sorted by name. */
export function pointGraph(modules: readonly AdminModule[]): Point[] {
  const points = new Map<string, Point>();
  const at = (name: string): Point => {
    const found = points.get(name);
    if (found) return found;
    const fresh: Point = { name, answers: [], callers: [], unanswered: false };
    points.set(name, fresh);
    return fresh;
  };

  for (const m of modules) {
    // A definer names its points locally; the full name carries its id, which is
    // what makes ownership readable and two authors unable to collide.
    for (const d of m.definesPoints ?? []) {
      const point = at(`${m.id}/${d.name}`);
      point.definedBy = m.id;
      point.version = d.version ?? 1;
    }
    for (const c of m.contributes ?? []) {
      at(c.point).answers.push({
        moduleId: m.id,
        name: m.name,
        instance: c.id ?? undefined,
        live: isLive(m),
      });
    }
    for (const req of m.consumes ?? []) {
      at(req.point).callers.push({
        moduleId: m.id,
        name: m.name,
        instance: req.id ?? undefined,
      });
    }
  }

  for (const point of points.values()) {
    point.unanswered =
      point.callers.length > 0 &&
      !point.callers.every((caller) =>
        point.answers.some(
          (a) => a.live && (caller.instance == null || a.instance === caller.instance),
        ),
      );
  }

  return [...points.values()].sort((a, b) => a.name.localeCompare(b.name));
}
