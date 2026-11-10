import type { Runtime } from '../../shared/television';
import { AdbConnection } from './adb/connection';
import { shell } from './adb/install-apk';
import { existingAdbKeys } from './adb/key';
import { androidProps, androidRuntime } from './runtime';

const CONNECT_TIMEOUT_MS = 5000;
const WEBVIEW_PACKAGE = 'com.google.android.webview';

export interface AdbDevice {
  runtime: Runtime | null;
  model: string;
  vendor: string;
}

/**
 * What a set answers over adb, or null when it refused the connection or
 * trusts none of this computer's keys. A scan never asks the TV to trust a
 * key, so it shows no prompt, and never fails over a set that will not talk.
 */
export async function adbDevice(host: string, port: number): Promise<AdbDevice | null> {
  const keys = await existingAdbKeys();
  if (keys.length === 0) return null;

  let connection: AdbConnection | null = null;
  try {
    connection = await AdbConnection.open(host, port, { keys, timeoutMs: CONNECT_TIMEOUT_MS });
    const printed = androidProps(await shell(connection, 'getprop'));
    const webview = await shell(connection, `dumpsys package ${WEBVIEW_PACKAGE}`);
    return {
      runtime: androidRuntime(printed, webview),
      model: printed['ro.product.model'] ?? '',
      vendor: printed['ro.product.manufacturer'] ?? '',
    };
  } catch {
    return null;
  } finally {
    connection?.close();
  }
}
