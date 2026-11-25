const MEDIA = /^(?:player|rewind)(?:-|$)/;
const POINTS = /(?:^|-)(?:left|right|back|forward)(?:-|$)/;
const OPENS = new Set([
  'backspace',
  'external-link',
  'indent-decrease',
  'indent-increase',
  'login',
  'login-2',
  'logout',
  'logout-2',
  'send',
  'send-2',
]);

/** Whether a glyph turns round in a language written right to left: one that
 *  points a way along the line (a chevron, an arrow, back, forward, "open in",
 *  send, sign out). Media transport never does, since a timeline runs left to
 *  right in every script. */
export function mirrorsInRtl(name: string): boolean {
  if (MEDIA.test(name)) {
    return false;
  }
  return POINTS.test(name) || OPENS.has(name);
}
