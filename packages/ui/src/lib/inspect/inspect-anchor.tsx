import { PureComponent } from 'react';
import type { FocusHolder } from '../focus-holder';
import { mountedAnchors } from './mounted-anchors';

const GLOBAL = '__KROMA_UI__';

const load = () => import('./index');

const reader = Object.freeze({
  describeScreen: () => load().then((module) => module.describeScreen()),
  screenText: () => load().then((module) => module.screenText()),
});

/** Rendered once by every `KitProvider`, with the holder of the focus under
 *  it. It draws nothing and does nothing until mounted; mounting registers it
 *  for the reader and exposes `globalThis.__KROMA_UI__`, whose `describeScreen()`
 *  and `screenText()` load the reader on their first call. */
export class InspectAnchor extends PureComponent<Readonly<{ focus: FocusHolder }>> {
  componentDidMount(): void {
    mountedAnchors.add(this);
    if (Reflect.get(globalThis, GLOBAL) === undefined) {
      Reflect.set(globalThis, GLOBAL, reader);
    }
  }

  componentWillUnmount(): void {
    mountedAnchors.delete(this);
  }

  render(): null {
    return null;
  }
}
