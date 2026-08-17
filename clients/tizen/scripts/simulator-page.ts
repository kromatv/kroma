// The half of the simulator harness that runs INSIDE the simulator.
//
// Each function here is serialised with `Function.prototype.toString` and
// evaluated in the host page, so none of them may close over anything in this
// module: what you see in the body is the whole program. Keeping them as
// functions rather than the template literals this started as is what makes
// them typecheck against the DOM, format, and survive editing.
//
// `document` is the simulator's own chrome; the app lives in its viewport
// iframe, which is what `frame()` reaches.

/** What the emulated screen is showing, once a package has been loaded. */
export interface Painted {
  scripts: string[];
  rootChars: number;
  bodyBackground: string;
  tizen: string;
  webapis: string;
  cascadeLayers: string;
  customProperties: boolean;
  webfontApplied: boolean;
}

export function readPainted(): Painted | null {
  const frame = document.querySelector<HTMLIFrameElement>('iframe');
  const doc = frame?.contentDocument;
  const view = frame?.contentWindow;
  if (!doc || !view) return null;

  const span = doc.createElement('span');
  span.style.cssText = 'position:absolute;visibility:hidden;font-size:64px;white-space:nowrap';
  span.textContent = 'Who is watching?';
  const widthOf = (family: string): number => {
    span.style.fontFamily = family;
    doc.body.append(span);
    const width = span.offsetWidth;
    span.remove();
    return width;
  };

  return {
    scripts: [...doc.scripts].map((script) => script.getAttribute('src') ?? '').filter(Boolean),
    rootChars: doc.getElementById('root')?.innerHTML.length ?? 0,
    bodyBackground: view.getComputedStyle(doc.body).backgroundColor,
    tizen: typeof (view as { tizen?: unknown }).tizen,
    webapis: typeof (view as { webapis?: unknown }).webapis,
    cascadeLayers: typeof (view as { CSSLayerBlockRule?: unknown }).CSSLayerBlockRule,
    customProperties: (view as Window & typeof globalThis).CSS.supports('color', 'var(--k)'),
    webfontApplied: widthOf('"Hanken Grotesk"') !== widthOf('serif'),
  };
}

/** The label under the painted focus ring. The TV shell owns focus itself, so
 *  `document.activeElement` stays on `body` and says nothing. */
export function readFocusRing(): string | null {
  const frame = document.querySelector<HTMLIFrameElement>('iframe');
  const doc = frame?.contentDocument;
  const view = frame?.contentWindow;
  if (!doc || !view) return null;

  let ringed: string | null = null;
  for (const element of doc.querySelectorAll('*')) {
    const style = view.getComputedStyle(element);
    if (style.outlineStyle === 'none' || Number.parseFloat(style.outlineWidth) < 1) continue;
    const label = element.getAttribute('aria-label') ?? element.textContent ?? '';
    const text = label.replace(/\s+/g, ' ').trim();
    if (text) ringed = text.slice(0, 60);
  }
  return ringed;
}

/** Centre of one button on the simulator's remote graphic, in page coordinates. */
export function readButtonSpot(id: string): { x: number; y: number } | null {
  const element = document.getElementById(id);
  if (!element) return null;
  const box = element.getBoundingClientRect();
  return { x: Math.round(box.left + box.width / 2), y: Math.round(box.top + box.height / 2) };
}

export function setViewportSrc(src: string): void {
  const frame = document.querySelector<HTMLIFrameElement>('iframe');
  if (frame) frame.src = src;
}

// The two probes the engine gate makes, answered the way a set below that tier
// answers them. Installed before the app's own scripts run.
export function hideCascadeLayers(): void {
  delete (window as { CSSLayerBlockRule?: unknown }).CSSLayerBlockRule;
}

// Standalone rather than calling the one above: this is serialised on its own,
// so a reference to a sibling in this module is a free variable in the page.
export function hideCustomProperties(): void {
  delete (window as { CSSLayerBlockRule?: unknown }).CSSLayerBlockRule;
  const supports = window.CSS.supports.bind(window.CSS);
  window.CSS.supports = (...args: [string] | [string, string]) =>
    !args.join(' ').includes('var(') && supports(...(args as [string, string]));
}
