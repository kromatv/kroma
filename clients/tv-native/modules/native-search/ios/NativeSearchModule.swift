import ExpoModulesCore

/**
 * The JavaScript face of tvOS's search screen (see NativeSearchView.swift for
 * what it wraps, and why the platform's keyboard is the one worth having here).
 *
 * A view rather than a function: the search chrome IS the screen, and React
 * renders its results inside it as children.
 */
public class NativeSearchModule: Module {
  public func definition() -> ModuleDefinition {
    Name("NativeSearch")

    View(NativeSearchView.self) {
      Events("onChangeText", "onLayoutResults")

      Prop("placeholder") { (view: NativeSearchView, placeholder: String) in
        view.placeholder = placeholder
      }

      /// The query React believes in. Set on the way in only (Siri, a recent
      /// search): typing flows the other way, through `onChangeText`.
      Prop("text") { (view: NativeSearchView, text: String) in
        view.setText(text)
      }
    }
  }
}
