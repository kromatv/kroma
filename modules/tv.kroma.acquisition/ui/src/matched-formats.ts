/** The formats a profile put a score on, the heaviest first, ahead of the ones
 *  it scored at zero, which keep the order they matched in. */
export function scoredFirst<Format extends { score: number }>(
  formats: readonly Format[],
): Format[] {
  return [...formats].sort((a, b) => weight(b) - weight(a));
}

function weight(format: { score: number }): number {
  return Math.abs(format.score);
}
