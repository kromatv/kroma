/** Runs a command and exits with its code; a thrown error prints its message
 *  and exits 1, so a command never has to catch for the shell's sake. */
export async function exitAfter(work: number | Promise<number>): Promise<never> {
  try {
    return process.exit(await work);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return process.exit(1);
  }
}
