import {
  type ArtifactRequest,
  availableSources,
  type PackageKind,
  resolveArtifact,
  type Source,
} from '../../install/artifact';

export const ANDROID_PACKAGE: PackageKind = {
  extension: '.apk',
  globs: ['out/*.apk', 'clients/tv-native/android/app/build/outputs/apk/release/*.apk'],
  // The phone build sits in the same release and is not this app.
  pattern: 'KROMA-androidtv-*.apk',
  runArtifact: 'kroma-androidtv-apk',
};

export function androidSources(): Source[] {
  return availableSources(ANDROID_PACKAGE, false);
}

export async function resolveAndroidArtifact(request: ArtifactRequest): Promise<string> {
  if (request.source === 'build') {
    throw new Error('the Android TV .apk is built by the release workflow, not from here');
  }
  return resolveArtifact({ id: 'androidtv', kind: ANDROID_PACKAGE }, request);
}
