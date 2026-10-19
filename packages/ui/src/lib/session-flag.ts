/** A flag that lasts as long as this launch's session storage, and reads unset where there is none. */
export interface SessionFlag {
  isSet(): boolean;
  set(): void;
}

/** The session flag stored under `key`. */
export function sessionFlag(key: string): SessionFlag {
  return {
    isSet() {
      try {
        return globalThis.sessionStorage?.getItem(key) === '1';
      } catch {
        return false;
      }
    },
    set() {
      try {
        globalThis.sessionStorage?.setItem(key, '1');
      } catch {}
    },
  };
}
