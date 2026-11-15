export type Outcome<T> = { ok: true; value: T } | { ok: false; reason: string };

/** A promise's result as a value, so one half of a report failing does not stop the other. */
export async function settle<T>(work: Promise<T>): Promise<Outcome<T>> {
  try {
    return { ok: true, value: await work };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}
