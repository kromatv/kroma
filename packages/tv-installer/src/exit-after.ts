export async function exitAfter(work: number | Promise<number>): Promise<never> {
  try {
    return process.exit(await work);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return process.exit(1);
  }
}
