/** What a panel marks as the part it is dragged by: the `dataSet` a part
 *  wears, and the selector this file finds it with. */
export const GRIP_DATA = { kromaI18nGrip: '' };
const GRIP = '[data-kroma-i18n-grip]';

/** The gap the tools keep from the corner they park in. */
export const EDGE_PX = 16;

interface Box {
  width: number;
  height: number;
}

const THRESHOLD_PX = 4;
const MARGIN_PX = 8;

interface Grab {
  pointerX: number;
  pointerY: number;
  left: number;
  top: number;
  width: number;
  height: number;
}

function bounded(value: number, size: number, limit: number): number {
  return Math.min(Math.max(value, MARGIN_PX), Math.max(limit - size - MARGIN_PX, MARGIN_PX));
}

function moveTo(host: HTMLElement, x: number, y: number, size?: Box): void {
  const { width, height } = size ?? host.getBoundingClientRect();
  host.style.right = 'auto';
  host.style.bottom = 'auto';
  host.style.left = `${bounded(x, width, window.innerWidth)}px`;
  host.style.top = `${bounded(y, height, window.innerHeight)}px`;
}

export function place(host: HTMLElement, x: number, y: number): void {
  moveTo(host, x, y);
}

/** Put `host` back in its corner, leaving where it was dragged to on file for
 *  whatever is put back there. */
export function anchor(host: HTMLElement): void {
  host.style.left = 'auto';
  host.style.top = 'auto';
  host.style.right = `${EDGE_PX}px`;
  host.style.bottom = `${EDGE_PX}px`;
}

/** Pull `host` back inside the viewport whenever it or the window changes size.
 *  A badge dropped in a corner becomes a panel four times its height when it
 *  opens, and the window it was placed in is not the window it is read in. */
export function keepInView(host: HTMLElement): () => void {
  const clamp = () => {
    const left = Number.parseFloat(host.style.left);
    const top = Number.parseFloat(host.style.top);
    if (Number.isNaN(left) || Number.isNaN(top)) return;
    moveTo(host, left, top);
  };
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(clamp);
  observer?.observe(host);
  window.addEventListener('resize', clamp);
  return () => {
    observer?.disconnect();
    window.removeEventListener('resize', clamp);
  };
}

/**
 * Drag `host` by its grip, and only by its grip: the bubble draws none, so it
 * stays parked where the tool was left rather than sliding out from under the
 * pointer that meant to open it.
 *
 * A press that never passes the threshold stays a press, so the grip can carry
 * a control of its own; one that does swallows the click it would otherwise
 * have become.
 */
export function draggable(host: HTMLElement, onDrop: (x: number, y: number) => void): () => void {
  let dragged = false;
  // The pointer is only followed while the grip is held, so what follows it
  // exists only then: nothing has to ask whether there is a grab.
  let release = () => {};

  const down = (event: PointerEvent) => {
    if (!(event.target as Element | null)?.closest?.(GRIP)) return;
    const box = host.getBoundingClientRect();
    const grab: Grab = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      left: box.left,
      top: box.top,
      width: box.width,
      height: box.height,
    };
    dragged = false;

    const move = (moved: PointerEvent) => {
      const dx = moved.clientX - grab.pointerX;
      const dy = moved.clientY - grab.pointerY;
      if (!dragged && Math.hypot(dx, dy) < THRESHOLD_PX) return;
      dragged = true;
      moveTo(host, grab.left + dx, grab.top + dy, grab);
    };

    const up = () => {
      if (dragged) {
        const dropped = host.getBoundingClientRect();
        onDrop(dropped.left, dropped.top);
      }
      release();
    };

    release = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      release = () => {};
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const click = (event: MouseEvent) => {
    if (!dragged) return;
    dragged = false;
    event.stopPropagation();
    event.preventDefault();
  };

  host.addEventListener('pointerdown', down);
  host.addEventListener('click', click, true);
  return () => {
    host.removeEventListener('pointerdown', down);
    host.removeEventListener('click', click, true);
    release();
  };
}
