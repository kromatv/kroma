const DOCUMENT_NODE = 9;

function connected(this: Node): boolean {
  const doc = this.ownerDocument;
  if (doc === null) {
    return this.nodeType === DOCUMENT_NODE;
  }
  return doc.contains(this);
}

/** Gives `Node.prototype.isConnected` (Chrome 54) to an engine without it.
 * react-native-web's `measure` and `measureLayout` answer only for a node
 * that says it is connected, so without this neither ever calls back. */
export function connectNodes(node: { prototype: Node }): void {
  if ('isConnected' in node.prototype) {
    return;
  }
  Object.defineProperty(node.prototype, 'isConnected', {
    configurable: true,
    enumerable: true,
    get: connected,
  });
}
