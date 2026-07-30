// The globals a Tizen JS service runs with; there is no @types package for the
// service runtime, and it is NOT the browser's `tizen` (no DOM, no `fs`).
// Narrow on purpose: only what preview-service.ts touches, since the compiler
// cannot check any of it against a real TV.

interface TizenFileStream {
  bytesAvailable: number;
  read(count: number): string;
  close(): void;
}

interface TizenFile {
  resolve(path: string): TizenFile;
  openStream(
    mode: 'r' | 'w' | 'a',
    onSuccess: (stream: TizenFileStream) => void,
    onError: (error: unknown) => void,
    encoding?: string,
  ): void;
}

declare const tizen: {
  application: { getCurrentApplication(): { exit(): void } };
  filesystem: {
    resolve(
      location: string,
      onSuccess: (dir: TizenFile) => void,
      onError: (error: unknown) => void,
      mode?: 'r' | 'rw',
    ): void;
  };
};

declare const webapis: {
  preview?: {
    setPreviewData(data: string, onSuccess: () => void, onError: (error: unknown) => void): void;
  };
};
