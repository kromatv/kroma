import { statSync } from 'node:fs';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractZip, packZip } from '../../install/zip';
import { type LogLine, run } from '../../shared/run';
import { createAuthorCertificate } from './certificate/authority';
import { randomPassword } from './certificate/password';
import { writeProfile } from './certificate/profile';
import { signWidget } from './certificate/widget';
import { duidAt } from './duid';
import { readTizenPackage, type TizenPackage } from './package-manifest';
import { activeProfile, type SigningProfile } from './profiles';
import { obtainCertificates } from './samsung/obtain';
import { coversSet, readSamsungProfile } from './samsung/profile';

const SIGNATURES = ['author-signature.xml', 'signature1.xml', 'signature2.xml'];
const KROMA_PROFILE = 'kroma';

const CERTIFICATES = join(homedir(), '.kroma', 'certificates');
const DUID_TIMEOUT_MS = 20_000;

export interface Signed {
  path: string;
  /** A staged copy the caller has to delete, rather than a directory it owns. */
  staged: boolean;
  package: TizenPackage;
}

/**
 * The profile that signs for a set: the certificates Samsung issued to this
 * tool when they list it, else the profile Tizen Studio signs with. With
 * neither, in a terminal, Samsung is asked for them on the spot. What is left
 * is an author generated here, which signs for an emulator only.
 */
export async function profileFor(host: string, log: LogLine): Promise<SigningProfile> {
  const duid = await duidAt(host).catch(() => null);
  const kept = readSamsungProfile();
  if (kept && duid && coversSet(duid)) return kept;

  const studio = await activeProfile();
  if (studio) return studio;

  if (duid && process.stdin.isTTY) {
    log('this set has no certificate from Samsung yet');
    await obtainCertificates({ duid, log });
    const issued = readSamsungProfile();
    if (issued) return issued;
  }
  return kept ?? generatedProfile(log);
}

async function generatedProfile(log: LogLine): Promise<SigningProfile> {
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
 * Signs the package, a native `.tpk` or a web `.wgt`, with this machine's own
 * certificate and answers where the new one is. A retail Samsung refuses every
 * other signature, so the one a release carries is never the one that
 * installs. Both kinds take the same signature over the same files.
 */
export async function resign(
  artifact: string,
  profile: SigningProfile,
  log: LogLine,
): Promise<Signed> {
  log(`signing with profile ${profile.name}`);
  const workspace = await mkdtemp(join(tmpdir(), 'kroma-tizen-'));
  const stage = join(workspace, 'app');
  await stageInto(artifact, stage);
  const tizenPackage = readTizenPackage(stage);

  await Promise.all(SIGNATURES.map((file) => rm(join(stage, file), { force: true })));
  await signWidget({ directory: stage, author: profile.author, distributor: profile.distributor });

  const path = join(workspace, `KROMA.${tizenPackage.type}`);
  await packZip(stage, path);
  return { path, staged: true, package: tizenPackage };
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

async function stageInto(artifact: string, stage: string): Promise<void> {
  if (statSync(artifact).isDirectory()) {
    await cp(artifact, stage, { recursive: true });
    return;
  }
  await extractZip(artifact, stage);
}
