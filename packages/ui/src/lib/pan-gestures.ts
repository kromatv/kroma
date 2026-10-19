import { Platform, type PanResponderInstance } from 'react-native';

/** The responder's handlers where a finger can drag it, null on a television. */
export function panHandlers(pan: PanResponderInstance) {
  return Platform.isTV ? null : pan.panHandlers;
}
