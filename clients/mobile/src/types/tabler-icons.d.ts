// Deep per-icon imports from @tabler/icons-react-native ship no declaration
// files; this ambient module types them (the barrel's transform is unreliable
// under Metro's Hermes profile, so the app imports icons individually).

declare module '@tabler/icons-react-native/dist/esm/icons/*.mjs' {
  import type { ComponentType } from 'react';
  import type { ColorValue } from 'react-native';

  interface TablerIconProps {
    width?: number;
    height?: number;
    color?: ColorValue;
    fill?: ColorValue;
    strokeWidth?: number;
  }
  const Icon: ComponentType<TablerIconProps>;
  export default Icon;
}
