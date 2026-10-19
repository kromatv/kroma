import ExpoModulesCore
import UIKit

public class FocusShieldModule: Module {
  public func definition() -> ModuleDefinition {
    Name("FocusShield")

    View(FocusShieldView.self) {
      Prop("shielded") { (view: FocusShieldView, shielded: Bool) in
        view.shielded = shielded
      }
    }
  }
}

public class FocusShieldView: ExpoView {
  var shielded = true

  public override var canBecomeFocused: Bool {
    false
  }

  public override func focusItems(in rect: CGRect) -> [any UIFocusItem] {
    shielded ? [] : super.focusItems(in: rect)
  }
}
