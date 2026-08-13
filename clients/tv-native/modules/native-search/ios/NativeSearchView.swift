import ExpoModulesCore
import UIKit

/**
 * tvOS's own search screen, with KROMA's results grid rendered into the search
 * controller's results view controller. Adopting `UISearchController` is the
 * only way to get Siri Remote dictation: tvOS never lends an app the microphone,
 * but the system keyboard hears it.
 *
 * The focus is SHARED rather than taken. The field and the keyboard are the
 * platform's to focus; the results are the app's, where a ring the spatial
 * navigator draws walks over views tvOS knows nothing about. `focus` and
 * `onFocusOwner` are the two ends of that hand-off (see the shell's
 * native-search.tsx).
 */
public final class NativeSearchView: ExpoView, UISearchResultsUpdating {
  private let onChangeText = EventDispatcher()
  private let onLayoutResults = EventDispatcher()
  private let onFocusOwner = EventDispatcher()

  private let content = UIView()
  private let resultsFocusHost = ResultsFocusHost()
  private let resultsViewController = ResultsViewController()
  private lazy var searchController: UISearchController = {
    let controller = UISearchController(searchResultsController: resultsViewController)
    controller.searchResultsUpdater = self
    // The results are the screen, not an overlay over a dimmed one.
    controller.obscuresBackgroundDuringPresentation = false
    return controller
  }()
  // The navigation controller is required, not cosmetic: presented bare, tvOS
  // lays the search out in its compact form instead of the full-screen one.
  private lazy var containerViewController: UINavigationController = {
    let search = UISearchContainerViewController(searchController: searchController)
    let navigation = UINavigationController(rootViewController: search)
    navigation.isNavigationBarHidden = true
    return navigation
  }()

  private var attached = false
  // Guards the round trip through `updateSearchResults` so text set by React is
  // not reported back as if the user had typed it.
  private var textFromReact: String?
  private var reportedSize: CGSize = .zero
  private var wantedOwner: FocusOwner = .platform
  private var reportedOwner: FocusOwner?
  private var focusUpdates: NSObjectProtocol?

  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    resultsViewController.view.backgroundColor = .clear
    resultsViewController.view.addSubview(content)
    // OVER React's grid, and the only focusable thing in the results area: the
    // posters are the navigator's, so this is what tvOS moves its own focus onto
    // when the viewer leaves the keyboard. Over rather than under because the
    // focus engine refuses an item anything at all is drawn on top of, and this
    // one is transparent and wants no touches of its own.
    resultsViewController.view.addSubview(resultsFocusHost)
    resultsViewController.onLayout = { [weak self] bounds in
      self?.layoutResults(in: bounds)
    }
  }

  var placeholder: String = "" {
    didSet { searchController.searchBar.placeholder = placeholder }
  }

  // Ignored when the field already says this, so typing is never fought over.
  func setText(_ text: String) {
    guard searchController.searchBar.text != text else { return }
    textFromReact = text
    searchController.searchBar.text = text
  }

  // Same shape as `setText`: what React asks for, ignored while it is already
  // where the focus is, so a press the platform answered is not answered twice.
  func setFocusOwner(_ owner: FocusOwner) {
    wantedOwner = owner
    guard owner != reportedOwner else { return }
    moveFocus(to: owner)
  }

  public override var preferredFocusEnvironments: [UIFocusEnvironment] {
    guard attached else { return super.preferredFocusEnvironments }
    // The search CONTROLLER, not the container it was pushed into: the container
    // prefers its own (empty) view, and the field and keyboard are in the
    // controller it presents over it.
    return [wantedOwner == .app ? resultsFocusHost : searchController]
  }

  // `requestFocusUpdate` rather than `setNeedsFocusUpdate`: the focus can be
  // anywhere at all when this runs - on the app's own host, or nowhere, both of
  // which make the plain call a no-op.
  private func moveFocus(to owner: FocusOwner) {
    guard attached, let system = UIFocusSystem.focusSystem(for: self) else { return }
    // The results refuse to let the focus go on their own (see ResultsFocusHost);
    // this is the one moment they are asked to. Only when they are the SOURCE:
    // as the destination the same flag makes the host unfocusable, and since it
    // is the only focusable thing in the results area the update has nowhere to
    // land and UIKit refuses it.
    resultsFocusHost.releasing = owner == .platform
    system.requestFocusUpdate(to: owner == .app ? resultsFocusHost : searchController)
    system.updateFocusIfNeeded()
    resultsFocusHost.releasing = false
  }

  // The app's focus host is removed as this view mounts, and a focus that had
  // nowhere to go does not come looking again - so every update the system
  // makes is a chance to take what was dropped. Only when it landed outside
  // this screen: inside it, where the focus sits is the viewer's business.
  private func claimFocusIfLoose() {
    guard attached, !holdsFocus(UIFocusSystem.focusSystem(for: self)?.focusedItem) else { return }
    moveFocus(to: wantedOwner)
  }

  private func holdsFocus(_ item: UIFocusItem?) -> Bool {
    var environment: UIFocusEnvironment? = item
    while let current = environment {
      if current === self { return true }
      environment = current.parentFocusEnvironment
    }
    return false
  }

  // The search container needs a parent view controller and there is no reliable
  // handle to React's, so the responder chain supplies the nearest one.
  private func nearestViewController() -> UIViewController? {
    var responder: UIResponder? = next
    while let current = responder {
      if let viewController = current as? UIViewController {
        return viewController
      }
      responder = current.next
    }
    return nil
  }

  public override func didMoveToWindow() {
    super.didMoveToWindow()
    // Leaving the window tears the attachment down, so an instance the shell
    // recycles into a new window attaches again instead of coming back inert.
    guard window != nil else {
      detach()
      return
    }
    guard !attached, let parent = nearestViewController() else { return }
    attached = true
    parent.addChild(containerViewController)
    containerViewController.view.frame = bounds
    containerViewController.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    addSubview(containerViewController.view)
    containerViewController.didMove(toParent: parent)
    focusUpdates = NotificationCenter.default.addObserver(
      forName: UIFocusSystem.didUpdateNotification,
      object: nil,
      queue: .main
    ) { [weak self] _ in self?.claimFocusIfLoose() }
    claimFocusIfLoose()
  }

  private func detach() {
    guard attached else { return }
    attached = false
    if let focusUpdates {
      NotificationCenter.default.removeObserver(focusUpdates)
      self.focusUpdates = nil
    }
    containerViewController.willMove(toParent: nil)
    containerViewController.view.removeFromSuperview()
    containerViewController.removeFromParent()
    reportedOwner = nil
    reportedSize = .zero
  }

  deinit {
    if let focusUpdates {
      NotificationCenter.default.removeObserver(focusUpdates)
    }
  }

  public override func layoutSubviews() {
    super.layoutSubviews()
    containerViewController.view.frame = bounds
  }

  // React lays its grid out in the results area's own coordinates, so UIKit's
  // chosen size has to go over as an event.
  private func layoutResults(in bounds: CGRect) {
    content.frame = bounds
    resultsFocusHost.frame = bounds
    guard bounds.size != reportedSize else { return }
    reportedSize = bounds.size
    onLayoutResults(["width": bounds.width, "height": bounds.height])
  }

  // React's children belong to the results view controller, not to this view:
  // `self` is only the anchor that puts the search container on screen.
  public override func mountChildComponentView(_ childComponentView: UIView, index: Int) {
    content.insertSubview(childComponentView, at: min(index, content.subviews.count))
  }

  // `index` is unused: a view removes itself from wherever it was mounted, and
  // the parameter only stays for the override's signature.
  public override func unmountChildComponentView(_ childComponentView: UIView, index _: Int) {
    childComponentView.removeFromSuperview()
  }

  public override func didUpdateFocus(
    in context: UIFocusUpdateContext,
    with coordinator: UIFocusAnimationCoordinator
  ) {
    super.didUpdateFocus(in: context, with: coordinator)
    guard let next = context.nextFocusedView, next.isDescendant(of: self) else { return }
    let owner: FocusOwner = next === resultsFocusHost ? .app : .platform
    guard owner != reportedOwner else { return }
    reportedOwner = owner
    // The heading travels with it: the press that carried the focus out of the
    // chrome is one the app never heard, and the navigator needs it to pick the
    // ring up where the viewer was already going.
    onFocusOwner(["owner": owner.rawValue, "heading": headingName(context.focusHeading)])
  }

  public func updateSearchResults(for searchController: UISearchController) {
    let text = searchController.searchBar.text ?? ""
    if let fromReact = textFromReact, fromReact == text {
      textFromReact = nil
      return
    }
    textFromReact = nil
    onChangeText(["text": text])
  }
}

/** Which focus engine holds the ring while the search screen is up. */
public enum FocusOwner: String, Enumerable {
  case platform
  case app
}

// Only the four the navigator can act on; anything else (a programmatic move,
// a first focus) travels as the empty string.
private func headingName(_ heading: UIFocusHeading) -> String {
  if heading.contains(.up) { return "up" }
  if heading.contains(.down) { return "down" }
  if heading.contains(.left) { return "left" }
  if heading.contains(.right) { return "right" }
  return ""
}

private final class ResultsFocusHost: UIView {
  // Set only while React hands the focus back to the keyboard: for that one
  // update the results neither hold the focus nor are a candidate for it.
  var releasing = false

  override var canBecomeFocused: Bool { !releasing }

  override func shouldUpdateFocus(in context: UIFocusUpdateContext) -> Bool {
    guard !releasing else { return super.shouldUpdateFocus(in: context) }
    // A direction spent inside the results moves the navigator's ring, not the
    // platform's focus, and only the navigator knows when the ring has run out
    // of grid to cross - so leaving is refused until it says so.
    let leaving = context.previouslyFocusedView === self && context.nextFocusedView !== self
    return !leaving
  }
}

private final class ResultsViewController: UIViewController {
  var onLayout: ((CGRect) -> Void)?

  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    onLayout?(view.bounds)
  }
}
