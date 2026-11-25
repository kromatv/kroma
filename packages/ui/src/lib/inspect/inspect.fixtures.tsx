import { Component, type ReactNode } from 'react';
import { committedTree, type Fiber, fiberOfInstance } from './react-fiber';
import type { KitNode } from './screen-tree';

/** Every node as the path of names that leads to it, `Dialog.Root/Dialog.Footer`. */
export function paths(nodes: readonly KitNode[], prefix = ''): string[] {
  return nodes.flatMap((node) => {
    const path = `${prefix}${node.name}`;
    return [path, ...paths(node.children, `${path}/`)];
  });
}

/** The first node called `name`, depth first. */
export function find(nodes: readonly KitNode[], name: string): KitNode | undefined {
  for (const node of nodes) {
    const found = node.name === name ? node : find(node.children, name);
    if (found) {
      return found;
    }
  }
  return undefined;
}

/** A class component a test mounts to reach the committed tree it sits in. */
export class TreeProbe extends Component<{ children?: ReactNode }> {
  tree(): Fiber | null {
    const fiber = fiberOfInstance(this);
    return (fiber && committedTree(fiber)?.current) ?? null;
  }

  render(): ReactNode {
    return this.props.children;
  }
}
