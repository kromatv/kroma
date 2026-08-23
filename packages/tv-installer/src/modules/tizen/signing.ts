import { statSync } from 'node:fs';
import { cp, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { type LogLine, run, runOk } from '../../run';
import { createAuthorCertificate } from './certificate/authority';
import { randomPassword } from './certificate/password';
import { writeProfile } from './certificate/profile';
import { signWidget } from './certificate/widget';
import { activeProfile, type SigningProfile } from './profiles';

const SIGNATURES = ['author-signature.xml', 'signature1.xml', 'signature2.xml'];
const KROMA_PROFILE = 'kroma';

const CERTIFICATES = join(homedir(), '.kroma', 'certificates');
const PACKAGE_NAME = 'KROMA.wgt';
const DUID_TIMEOUT_MS = 20_000;

export interface Signed {
  path: string;
  /** A staged copy the caller has to delete, rather than a directory it owns. */
  staged: boolean;
}

/**
 * The profile to sign with, generated here if this machine has none. What can
 * be generated is the author half: the distributor certificate a retail set
 * insists on is Samsung's to issue, against that one set's DUID.
 */
export async function ensureProfile(log: LogLine): Promise<SigningProfile> {
  const existing = await activeProfile();
  if (existing) return existing;

  log('no signing profile here, generating an author certificate');
  const author = await createAuthorCertificate({
    directory: join(CERTIFICATES, KROMA_PROFILE),
    alias: KROMA_PROFILE,
    password: randomPassword(),
    subject: { commonName: 'KROMA', organization: 'KROMA' },
  });
  log(`certificate at ${author.certificate}`);

  const profile = {
    name: KROMA_PROFILE,
    author: { archive: author.archive, password: author.password },
  };
  await writeProfile(profile).catch(() => undefined);
  return profile;
}

/**
 * Signs the package with this machine's own certificate and answers where the
 * new one is. A retail Samsung refuses every other signature, so the one a
 * release carries is never the one that installs.
 */
export async function resign(
  artifact: string,
  profile: SigningProfile,
  log: LogLine,
): Promise<Signed> {
  log(`signing with profile ${profile.name}`);
  const workspace = await mkdtemp(join(tmpdir(), 'kroma-wgt-'));
  const stage = join(workspace, 'app');
  await stageInto(artifact, stage, log);

  await Promise.all(SIGNATURES.map((file) => rm(join(stage, file), { force: true })));
  await signWidget({ directory: stage, author: profile.author, distributor: profile.distributor });

  const path = join(workspace, PACKAGE_NAME);
  await pack(stage, path, log);
  return { path, staged: true };
}

/** What Samsung binds a distributor certificate to, read off the set itself. */
export async function readDuid(sdb: string, log: LogLine): Promise<string | null> {
  const { code, output } = await run([sdb, 'shell', '0', 'getduid'], {
    log,
    timeoutMs: DUID_TIMEOUT_MS,
  });
  const duid = output.trim().split('\n').at(-1)?.trim();
  return code === 0 && duid ? duid : null;
}

async function stageInto(artifact: string, stage: string, log: LogLine): Promise<void> {
  if (statSync(artifact).isDirectory()) {
    await cp(artifact, stage, { recursive: true });
    return;
  }
  await mkdir(stage, { recursive: true });
  await runOk(['unzip', '-q', '-o', artifact, '-d', stage], { log });
}

// A widget is a plain zip, and the signatures cover the files rather than the
// archive, so anything that zips produces a package the set accepts.
async function pack(stage: string, path: string, log: LogLine): Promise<void> {
  if (!Bun.which('zip')) throw new Error('zip is needed to repack the widget and is not here');
  await runOk(['zip', '-X', '-r', '-q', path, '.'], { cwd: stage, log });
}
