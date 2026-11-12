import { connect, SDB_PORT, type SdbDevice } from './sdb';

/** Opens a set on its sdb port, and says what developer mode needs when nothing answers. */
export async function reach(host: string): Promise<SdbDevice> {
  try {
    return await connect(host);
  } catch (error) {
    const said = error instanceof Error ? error.message : String(error);
    throw new Error(
      `${said}. Nothing answered on ${SDB_PORT}: developer mode has to be on, naming this computer as the host PC, and the set rebooted since`,
    );
  }
}
