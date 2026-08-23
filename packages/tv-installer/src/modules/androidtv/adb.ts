import { run } from '../../run';
import type { Runtime } from '../../television';
import { locate } from '../../toolchain/detect';
import { androidProps, androidRuntime } from './runtime';
import { ADB } from './tools';

const CONNECT_TIMEOUT_MS = 5000;
const SHELL_TIMEOUT_MS = 5000;
const WEBVIEW_PACKAGE = 'com.google.android.webview';

export interface AdbDevice {
  runtime: Runtime | null;
  model: string;
  vendor: string;
}

/**
 * What a set answers over adb, or null when adb is not installed, the set
 * refused the connection, or nobody has accepted the prompt on its screen. A
 * scan never fails over any of the three.
 */
export async function adbDevice(host: string, port: number): Promise<AdbDevice | null> {
  const adb = locate(ADB);
  if (!adb) return null;

  const serial = `${host}:${port}`;
  try {
    const connected = await run([adb, 'connect', serial], { timeoutMs: CONNECT_TIMEOUT_MS });
    if (!connected.output.includes('connected')) return null;

    const props = await run([adb, '-s', serial, 'shell', 'getprop'], {
      timeoutMs: SHELL_TIMEOUT_MS,
    });
    if (props.code !== 0) return null;

    const printed = androidProps(props.output);
    const webview = await run([adb, '-s', serial, 'shell', 'dumpsys', 'package', WEBVIEW_PACKAGE], {
      timeoutMs: SHELL_TIMEOUT_MS,
    });
    return {
      runtime: androidRuntime(printed, webview.code === 0 ? webview.output : ''),
      model: printed['ro.product.model'] ?? '',
      vendor: printed['ro.product.manufacturer'] ?? '',
    };
  } catch {
    return null;
  }
}
