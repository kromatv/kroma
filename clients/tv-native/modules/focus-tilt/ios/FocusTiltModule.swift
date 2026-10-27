import ExpoModulesCore

public class FocusTiltModule: Module {
  public func definition() -> ModuleDefinition {
    Name("FocusTilt")

    View(FocusTiltView.self) {
      Prop("active") { (view: FocusTiltView, active: Bool) in
        view.setActive(active)
      }
    }
  }
}
