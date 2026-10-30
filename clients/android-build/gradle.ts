const MARKER = '// KROMA Android upload signing';

const SIGNING = `${MARKER}
def kromaSigningNames = [
    'KROMA_ANDROID_KEYSTORE_PATH', 'KROMA_ANDROID_KEYSTORE_PASSWORD',
    'KROMA_ANDROID_KEY_ALIAS', 'KROMA_ANDROID_KEY_PASSWORD'
]
def kromaHasSigning = kromaSigningNames.every { System.getenv(it) }
if (kromaSigningNames.any { System.getenv(it) } && !kromaHasSigning) {
    throw new GradleException('KROMA Android signing configuration is incomplete')
}
gradle.taskGraph.whenReady { graph ->
    if (!kromaHasSigning && graph.allTasks.any { it.name == 'bundleRelease' }) {
        throw new GradleException('A Play app bundle requires the KROMA Android upload keystore')
    }
}
`;

const CONFIG = `signingConfigs {
        if (kromaHasSigning) {
            kromaUpload {
                storeFile file(System.getenv('KROMA_ANDROID_KEYSTORE_PATH'))
                storePassword System.getenv('KROMA_ANDROID_KEYSTORE_PASSWORD')
                keyAlias System.getenv('KROMA_ANDROID_KEY_ALIAS')
                keyPassword System.getenv('KROMA_ANDROID_KEY_PASSWORD')
            }
        }
    }
    `;

/** Patch the generated Expo Groovy template, without embedding any credentials. */
export function configureAndroidSigning(contents: string): string {
  if (contents.includes(MARKER)) return contents;
  const release = /(\brelease\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/;
  if (!release.test(contents) || !contents.includes('    buildTypes {')) {
    throw new Error('The Expo Android signing template changed; refusing an unsigned release');
  }
  return contents
    .replace(
      release,
      '$1signingConfig kromaHasSigning ? signingConfigs.kromaUpload : signingConfigs.debug',
    )
    .replace('    buildTypes {', `    ${CONFIG}buildTypes {`)
    .replace(/\bandroid\s*\{/, `${SIGNING}\nandroid {`);
}
