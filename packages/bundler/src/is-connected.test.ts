// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { connectNodes } from './is-connected';

const native = Object.getOwnPropertyDescriptor(Node.prototype, 'isConnected');

function withoutIsConnected(): void {
  Reflect.deleteProperty(Node.prototype, 'isConnected');
  connectNodes(Node);
}

afterEach(() => {
  document.body.replaceChildren();
  if (native) {
    Object.defineProperty(Node.prototype, 'isConnected', native);
  }
});

describe('connectNodes', () => {
  it('says an element in the document is connected', () => {
    const element = document.createElement('div');
    document.body.append(element);

    withoutIsConnected();

    expect(element.isConnected).toBe(true);
  });

  it('says an element taken out of the document is not', () => {
    const element = document.createElement('div');
    document.body.append(element);
    element.remove();

    withoutIsConnected();

    expect(element.isConnected).toBe(false);
  });

  it('says a node held only in a fragment is not', () => {
    const fragment = document.createDocumentFragment();
    const text = document.createTextNode('detached');
    fragment.append(text);

    withoutIsConnected();

    expect([fragment.isConnected, text.isConnected]).toEqual([false, false]);
  });

  it('says the document itself is connected', () => {
    withoutIsConnected();

    expect(document.isConnected).toBe(true);
  });

  it('leaves an engine that has the property as it is', () => {
    Object.defineProperty(Node.prototype, 'isConnected', { configurable: true, get: () => true });

    connectNodes(Node);

    expect(document.createElement('div').isConnected).toBe(true);
  });
});
