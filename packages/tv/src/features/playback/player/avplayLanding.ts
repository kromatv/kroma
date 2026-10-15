const AT_TOP_MS = 1000;
const TRIES = 3;

/**
 * The server's master is an `EXT-X-PLAYLIST-TYPE:EVENT` playlist with no
 * `EXT-X-ENDLIST`, which a native HLS stack reads as live: AVPlay opens it at the
 * end the remux has reached rather than at the anchor, so a stream joined after
 * the remux ran ahead plays minutes past its own clock.
 */
export class AvplayLanding {
  private triesLeft = 0;
  private seeking = false;

  /** A seek made at READY blocks the page for five seconds on Tizen 9 and is then
   * refused (`InvalidValuesError`), while the same seek once PLAYING lands. */
  attached(): void {
    this.triesLeft = TRIES;
    this.seeking = false;
  }

  /** AVPlay's latest time report; true when a seek back to the top is owed. A
   * seek takes seconds to answer while reports keep arriving every half second,
   * so only one is ever in flight. */
  reported(ms: number): boolean {
    if (this.seeking || this.triesLeft <= 0) return false;
    if (ms <= AT_TOP_MS) {
      this.triesLeft = 0;
      return false;
    }
    this.triesLeft -= 1;
    this.seeking = true;
    return true;
  }

  landed(): void {
    this.seeking = false;
    this.triesLeft = 0;
  }

  refused(): void {
    this.seeking = false;
  }
}
