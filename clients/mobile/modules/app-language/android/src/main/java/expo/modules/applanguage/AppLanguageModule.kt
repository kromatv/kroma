package expo.modules.applanguage

import android.app.LocaleManager
import android.os.Build
import android.os.LocaleList
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Writes the language Android 13 and later keep for this app under Settings >
 * Apps > KROMA > Language. Reading it needs nothing here: the app's in-process
 * LocaleList already leads with it, which is what expo-localization returns.
 */
class AppLanguageModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("AppLanguage")

    Constant("reach") {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) "set" else "none"
    }

    AsyncFunction("set") { tag: String ->
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        appContext.reactContext
          ?.getSystemService(LocaleManager::class.java)
          ?.applicationLocales = LocaleList.forLanguageTags(tag)
      }
    }.runOnQueue(Queues.MAIN)
  }
}
