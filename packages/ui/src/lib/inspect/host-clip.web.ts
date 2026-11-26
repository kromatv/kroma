import { webWindow } from '../dom';
import { firstHost } from './host-box';
import { type Fiber, hostNodeOf } from './react-fiber';
import { type TextClip, textClip } from './text-clip';

const NORMAL_LINE = 1.2;

function lineHeightOf(style: CSSStyleDeclaration): number {
  const stated = Number.parseFloat(style.lineHeight);
  const line = Number.isFinite(stated) ? stated : Number.parseFloat(style.fontSize) * NORMAL_LINE;
  return Number.isFinite(line) ? line : 0;
}

function elementOf(host: Fiber | null): Element | null {
  const node = host && hostNodeOf(host);
  return typeof Element === 'function' && node instanceof Element ? node : null;
}

/** What a component's text loses to its box: on the web, how far the first
 *  host element's scroll box reaches past its client box on each axis it
 *  clips, an ellipsis and a line clamp included, its line height read from
 *  its computed style (`normal` as 1.2 of its font size). */
export function hostClip(fiber: Fiber): TextClip | null {
  const element = elementOf(firstHost(fiber));
  const view = webWindow();
  if (!element || !view) {
    return null;
  }
  const style = view.getComputedStyle(element);
  return textClip({
    overflowX: style.overflowX,
    overflowY: style.overflowY,
    scroll: { width: element.scrollWidth, height: element.scrollHeight },
    client: { width: element.clientWidth, height: element.clientHeight },
    lineHeight: lineHeightOf(style),
  });
}
