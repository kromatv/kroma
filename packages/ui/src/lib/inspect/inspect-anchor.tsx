import { PureComponent } from 'react';
import { type MountedAnchor, mountedAnchors } from './mounted-anchors';
import { offerScreenTools } from './offer-screen-tools';

const GLOBAL = '__KROMA_UI__';

const load = () => import('./index');

const reader = Object.freeze({
  describeScreen: () => load().then((module) => module.describeScreen()),
  screenText: () => load().then((module) => module.screenText()),
  snapshot: () => load().then((module) => module.snapshot()),
  act: (call: unknown) => load().then((module) => module.act(call)),
});

/** Rendered once by every `KitProvider`, with the holder of the focus and the
 *  control engine under it. It draws nothing and does nothing until mounted;
 *  mounting registers it for the reader and exposes `globalThis.__KROMA_UI__`,
 *  whose `describeScreen()`, `screenText()`, `snapshot()` and `act()` load the
 *  reader on their first call. The first mount on a page whose browser exposes
 *  WebMCP also registers the screen tools there. */
export class InspectAnchor extends PureComponent<MountedAnchor['props']> {
  componentDidMount(): void {
    mountedAnchors.add(this);
    if (Reflect.get(globalThis, GLOBAL) === undefined) {
      Reflect.set(globalThis, GLOBAL, reader);
      offerScreenTools();
    }
  }

  componentWillUnmount(): void {
    mountedAnchors.delete(this);
  }

  render(): null {
    return null;
  }
}
