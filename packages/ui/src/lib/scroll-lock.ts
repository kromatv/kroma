export function useScrollLock(_locked: boolean): void {
  // Deliberately nothing: native scrolling lives inside ScrollViews an overlay
  // simply covers, so there is nothing to lock. The web half, which does have
  // a document to freeze, is in ./scroll-lock.web.
}
