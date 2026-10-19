const ALWAYS = () => true;

/** Whether the last focus move came from a direction key. Native focus only moves by key. */
export function useKeyGrace(_scoped: boolean): () => boolean {
  return ALWAYS;
}
