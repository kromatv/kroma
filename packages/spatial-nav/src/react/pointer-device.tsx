import {
  createContext,
  type ReactNode,
  type RefObject,
  useContext,
  useEffect,
  useRef,
} from 'react';
import { Platform } from 'react-native';

type PointerDevice = 'keys' | 'pointer';

const KEYS: RefObject<PointerDevice> = { current: 'keys' };

const DeviceContext = createContext<RefObject<PointerDevice>>(KEYS);

/**
 * Lets a pointer take the focus. A navigator boots deaf to the mouse, because
 * a television's remote is the only device most of them ever see; the first
 * mousemove under this provider is what turns hovering a `<NavigatorItem>`
 * into focusing it, on a browser and on a webOS Magic Remote alike.
 */
function PointerDeviceProvider({ children }: Readonly<{ children: ReactNode }>) {
  const device = useRef<PointerDevice>('keys');

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const pointerMoved = () => {
      device.current = 'pointer';
    };
    window.addEventListener('mousemove', pointerMoved);
    return () => window.removeEventListener('mousemove', pointerMoved);
  }, []);

  return <DeviceContext.Provider value={device}>{children}</DeviceContext.Provider>;
}

function usePointerDevice(): RefObject<PointerDevice> {
  return useContext(DeviceContext);
}

export type { PointerDevice };
export { PointerDeviceProvider, usePointerDevice };
