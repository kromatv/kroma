/** A page a sweep reads in: it can crash, and it closes. Playwright's `Page` is one. */
export interface TabPage {
  once(event: 'crash', listener: () => void): unknown;
  close(): Promise<void>;
}

/** Runs one read of a screen in the page of a tab. */
export type Tab<P> = <T>(read: (page: P) => Promise<T>) => Promise<T>;

type Opened<P> = Readonly<{ page: P; lost: Promise<never> }>;

const READ_DEADLINE_MS = 180_000;

class PageLost extends Error {}

async function opened<P extends TabPage>(context: { newPage(): Promise<P> }): Promise<Opened<P>> {
  const page = await context.newPage();
  const lost = new Promise<never>((_resolve, reject) => {
    page.once('crash', () => reject(new PageLost('the page crashed')));
  });
  void lost.catch(() => undefined);
  return { page, lost };
}

function within<T>(work: Promise<T>, lost: Promise<never>, deadlineMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new PageLost(`the page did not answer in ${deadlineMs / 1000} s`)),
      deadlineMs,
    );
  });
  return Promise.race([work, lost, late]).finally(() => clearTimeout(timer));
}

/** A tab in `context` that gives each read `deadlineMs`, three minutes unless
 *  told, and opens a new page in place of one that crashed or stopped
 *  answering, so the reads after it go on. */
export async function tabIn<P extends TabPage>(
  context: { newPage(): Promise<P> },
  deadlineMs = READ_DEADLINE_MS,
): Promise<Tab<P>> {
  let current = await opened(context);
  return async <T>(read: (page: P) => Promise<T>): Promise<T> => {
    try {
      return await within(read(current.page), current.lost, deadlineMs);
    } catch (error: unknown) {
      if (error instanceof PageLost) {
        void current.page.close().catch(() => undefined);
        current = await opened(context);
      }
      throw error;
    }
  };
}
