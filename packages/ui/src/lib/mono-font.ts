import { Platform } from 'react-native';

/** A monospaced family this renderer can draw: one family name natively, a CSS stack in a browser. */
export function monoFont(): string {
  return Platform.select({
    ios: 'Menlo',
    android: 'monospace',
    default: "ui-monospace, 'SF Mono', Menlo, monospace",
  });
}
