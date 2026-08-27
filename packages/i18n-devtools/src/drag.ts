const THRESHOLD_PX = 4;
const MARGIN_PX = 8;
const FALLBACK_WIDTH_PX = 120;
const FALLBACK_HEIGHT_PX = 40;

interface Grab {
  pointerX: number;
  pointerY: number;
  left: number;
  top: number;
  width: number;
  height: number;
}

function moveTo(host: HTMLElement, x: number, y: number, width: number, height: number): void {
  host.style.right = 'auto';
  host.style.bottom = 'auto';
  host.style.left = `${Math.min(Math.max(x, MARGIN_PX), window.innerWidth - width - MARGIN_PX)}px`;
  host.style.top = `${Math.min(Math.max(y, MARGIN_PX), window.innerHeight - height - MARGIN_PX)}px`;
}

export function place(host: HTMLElement, x: number, y: number): void {
  const width = host.offsetWidth || FALLBACK_WIDTH_PX;
  const height = host.offsetHeight || FALLBACK_HEIGHT_PX;
  moveTo(host, x, y, width, height);
}

/** Drag `host` from anywhere inside it. A press that never passes the threshold
 *  stays a press, so the badge under the pointer still opens the panel; one that
 *  does swallows the click it would otherwise have become. */
export function draggable(host: HTMLElement, onDrop: (x: number, y: number) => void): () => void {
  let grab: Grab | null = null;
  let dragged = false;

  const move = (event: PointerEvent) => {
    if (!grab) return;
    const dx = event.clientX - grab.pointerX;
    const dy = event.clientY - grab.pointerY;
    if (!dragged && Math.hypot(dx, dy) < THRESHOLD_PX) return;
    dragged = true;
    moveTo(host, grab.left + dx, grab.top + dy, grab.width, grab.height);
  };

  const release = () => {
    grab = null;
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
  };

  function up(): void {
    if (grab && dragged) {
      const box = host.getBoundingClientRect();
      onDrop(box.left, box.top);
    }
    release();
  }

  const down = (event: PointerEvent) => {
    const box = host.getBoundingClientRect();
    grab = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      left: box.left,
      top: box.top,
      width: box.width || FALLBACK_WIDTH_PX,
      height: box.height || FALLBACK_HEIGHT_PX,
    };
    dragged = false;
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
