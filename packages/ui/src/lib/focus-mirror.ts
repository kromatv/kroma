/** Native accessibility follows OS focus rather than a document. */
export function createFocusMirror(_pointerDriving: () => boolean) {
  return {
    mirrorFocus(_view: unknown): void {},
    isMirrored(_element: unknown): boolean {
      return false;
    },
    redeliverKey(_event: unknown): void {},
  };
}
