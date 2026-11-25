import { PureComponent } from 'react';
import type { FocusHolder } from '../focus-holder';
import { mountedAnchors } from './mounted-anchors';

const GLOBAL = '__KROMA_UI__';

const reader = Object.freeze({
  describeScreen: () => import('./describe-screen').then((module) => module.describeScreen()),
});

/** Rendered once by every `KitProvider`, with the holder of the focus under
 *  it. It draws nothing and does nothing until mounted; mounting registers it
 *  for the reader and exposes
 *  `globalThis.__KROMA_UI__.describeScreen()`, which loads the reader on its
 *  first call. */
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
