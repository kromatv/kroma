import type { Vars } from '../engine/engine';
import type { Outline } from '../live';
import { openInEditor } from '../server/editors';
import { perFrame } from './frame';
import { gradeOfNode, onThePage, shows } from './highlight';
import type { Grade } from './mark';
import { sightingIn, stripMarks } from './mark';
import { fileOfOrigin, type Origin, originAt, sourceOrigin } from './origin';

/** What the pointer is over, and where a card anchors to it. `key` is absent
 *  for a string that never went through a catalog: there is none. */
export interface Probe {
  readonly key: string | null;
  readonly text: string;
  readonly scope: string | null;
  readonly locale: string | null;
  readonly grade: Grade;
  readonly vars: Vars | undefined;
  readonly holes: readonly string[];
  readonly origin: Origin | null;
  readonly left: number;
  readonly top: number;
  readonly bottom: number;
  readonly copied: boolean;
}

const listeners = new Set<() => void>();
let probe: Probe | null = null;

function announce(next: Probe | null): void {
  probe = next;
  for (const listener of listeners) listener();
}

function nodeAt(x: number, y: number): Text | null {
  const node = document.caretPositionFromPoint?.(x, y)?.offsetNode;
  return node?.nodeType === Node.TEXT_NODE ? (node as Text) : null;
}

function probeOf(node: Text, outline: Outline): Probe | null {
  const text = node.nodeValue;
  if (!text || !onThePage(node)) return null;
  const marked = gradeOfNode(text);
  if (!marked || !shows(outline, marked)) return null;
  const sighting = sightingIn(text);
  const range = document.createRange();
  range.selectNodeContents(node);
  const box = range.getBoundingClientRect();
  return {
    key: sighting?.key ?? null,
    text: stripMarks(text).trim(),
    scope: sighting?.scope ?? null,
    locale: sighting?.locale ?? null,
    grade: sighting?.grade ?? marked,
    vars: sighting?.vars,
    holes: sighting?.holes ?? [],
    origin: sighting?.origin ?? originAt(node),
    left: box.left,
    top: box.top,
    bottom: box.bottom,
    copied: false,
  };
}

/**
 * Name the message under the pointer while the overlay is up: alt-click copies
 * its key, alt-shift-click opens where it is written.
 *
 * The click is swallowed in the capture phase, before it reaches the app: a
 * marked string is usually inside a control, and reading its key must not also
 * press it.
 */
export function installProbe(outline: Outline, editor: string | null): () => void {
  let x = 0;
  let y = 0;
  let over: Text | null = null;

  const look = perFrame(() => {
    const node = nodeAt(x, y);
    if (node === over) return;
    over = node;
    announce(node ? probeOf(node, outline) : null);
  });

  const move = (event: PointerEvent) => {
    x = event.clientX;
    y = event.clientY;
    look.fire();
  };

  const away = () => {
    over = null;
    announce(null);
  };

  const click = (event: MouseEvent) => {
    if (!event.altKey) return;
    const node = nodeAt(event.clientX, event.clientY);
    const found = node && probeOf(node, outline);
    if (!found || (!found.key && !found.origin)) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.shiftKey) {
      if (found.origin) openInEditor(fileOfOrigin(sourceOrigin(found.origin)), editor);
      return;
    }
    if (!found.key) return;
    void navigator.clipboard?.writeText(found.key).then(
      () => announce({ ...found, copied: true }),
      () => announce(found),
    );
  };

  document.addEventListener('pointermove', move);
  document.addEventListener('scroll', away, true);
  document.addEventListener('click', click, true);
  return () => {
    document.removeEventListener('pointermove', move);
    document.removeEventListener('scroll', away, true);
    document.removeEventListener('click', click, true);
    look.stop();
    away();
  };
}

export function probed(): Probe | null {
  return probe;
}

export function onProbe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
