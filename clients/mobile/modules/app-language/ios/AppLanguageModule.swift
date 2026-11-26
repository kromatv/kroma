import ExpoModulesCore

/**
 iOS keeps the app's language under Settings > KROMA > Language and gives apps
 no API to change it: Apple asks an app to send the user there instead, and
 relaunches the app in the language picked (WWDC19, session 403).
 */
public class AppLanguageModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AppLanguage")

    Constant("reach") {
      "open"
    }
  }
}
