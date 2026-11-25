import { warnInDevelopment } from '../dev-warning';
import { webDocument } from '../dom';
import type { ScreenTool } from './screen-tools';

type RegisterTool = (tool: ScreenTool) => Promise<unknown>;

function registerTool(): RegisterTool | null {
  const context: unknown = Reflect.get(webDocument() ?? {}, 'modelContext');
  const register: unknown = context instanceof Object && Reflect.get(context, 'registerTool');
  if (typeof register !== 'function') {
    return null;
  }
  return async (tool) => Reflect.apply(register, context, [tool]);
}

function unregistered(error: unknown): void {
  warnInDevelopment(`The screen tools were not registered with WebMCP: ${String(error)}`);
}

/** Registers the screen tools with the page's WebMCP model context
 *  (`document.modelContext`) when the browser exposes one, loading them only
 *  then. Does nothing anywhere else. */
export function offerScreenTools(): void {
  const register = registerTool();
  if (register) {
    void import('./screen-tools')
      .then(({ screenTools }) => Promise.all(screenTools.map(register)))
      .catch(unregistered);
  }
}
