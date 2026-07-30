import ExpoModulesCore
import UIKit

/**
 * tvOS's own search screen, with KROMA's results grid rendered into the search
 * controller's results view controller. Adopting `UISearchController` is the
 * only way to get Siri Remote dictation: tvOS never lends an app the microphone,
 * but the system keyboard hears it.
 */
public final class NativeSearchView: ExpoView, UISearchResultsUpdating {
  private let onChangeText = EventDispatcher()
  private let onLayoutResults = EventDispatcher()

  private let content = UIView()
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

  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    resultsViewController.view.backgroundColor = .clear
    resultsViewController.view.addSubview(content)
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
    guard window != nil, !attached, let parent = nearestViewController() else { return }
    attached = true
    parent.addChild(containerViewController)
    containerViewController.view.frame = bounds
    containerViewController.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    addSubview(containerViewController.view)
    containerViewController.didMove(toParent: parent)
  }

  public override func layoutSubviews() {
    super.layoutSubviews()
    containerViewController.view.frame = bounds
  }

  // React lays its grid out in the results area's own coordinates, so UIKit's
  // chosen size has to go over as an event.
  private func layoutResults(in bounds: CGRect) {
    content.frame = bounds
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

private final class ResultsViewController: UIViewController {
  var onLayout: ((CGRect) -> Void)?

  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    onLayout?(view.bounds)
  }
}
