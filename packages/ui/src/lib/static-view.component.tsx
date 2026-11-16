/** React Native has no cheaper host than its View, so every box is one. */
export function isStaticHost(_rest: Readonly<Record<string, unknown>>): boolean {
  return false;
}

export { View as StaticView } from 'react-native';
