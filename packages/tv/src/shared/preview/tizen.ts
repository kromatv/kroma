// Minimal Tizen typings for the foreground web runtime, plus a feature-detect.
// Everything is gated on the `tizen` global, so callers no-op elsewhere.

interface TizenFileStream {
  write(data: string): void;
  close(): void;
}
export interface TizenFile {
  resolve(path: string): TizenFile;
  createFile(path: string): TizenFile;
  openStream(
    mode: 'r' | 'w' | 'a' | 'rw',
    onSuccess: (stream: TizenFileStream) => void,
    onError: (e: unknown) => void,
    encoding?: string,
  ): void;
}
interface TizenAppControlData {
  key: string;
  value: string[];
}
interface TizenRequestedAppControl {
  appControl: { operation: string; data: TizenAppControlData[] };
}
interface TizenApp {
  getRequestedAppControl(): TizenRequestedAppControl | null;
}
export interface Tizen {
  filesystem: {
    resolve(
      location: string,
      onSuccess: (dir: TizenFile) => void,
      onError: (e: unknown) => void,
      mode?: 'r' | 'rw',
    ): void;
  };
  application: {
    getCurrentApplication(): TizenApp;
    launchAppControl(
      appControl: unknown,
      appId: string | null,
      onSuccess?: () => void,
      onError?: (e: unknown) => void,
      replyCallback?: unknown,
    ): void;
  };
  ApplicationControl: new (operation: string) => unknown;
}

export function tizen(): Tizen | null {
  const t = (globalThis as { tizen?: Tizen }).tizen;
  return t?.filesystem && t.application ? t : null;
}
