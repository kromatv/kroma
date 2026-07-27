import ExpoModulesCore
import UIKit

/**
 * tvOS's own search screen, with KROMA's results grid living inside it.
 *
 * This is the one screen where the platform keyboard beats ours, and the reason
 * is dictation: the Siri Remote's microphone is never lent to an app, but the
 * system keyboard hears it. Holding the Siri button while a `UISearchController`
 * is up dictates straight into the search field, which is why every tvOS media
 * app (Plex, Netflix, the TV app) uses this exact chrome rather than drawing its
 * own. Adopting it is what buys "hold to speak" without a microphone API.
 *
 * The layout is UIKit's: search field at the top, letter grid down the left, and
 * the search controller's results view controller filling what is left. React
 * renders into that last part, so the grid, the posters and their focus are
 * still ours - only the typing belongs to the system.
 */
public final class NativeSearchView: ExpoView, UISearchResultsUpdating {
  private let onChangeText = EventDispatcher()
  private let onLayoutResults = EventDispatcher()

  /// Every React child is re-parented in here, and this rides inside the search
  /// controller's results view controller rather than inside `self`.
  private let content = UIView()
  private let resultsViewController = ResultsViewController()
  private lazy var searchController: UISearchController = {
    let controller = UISearchController(searchResultsController: resultsViewController)
    controller.searchResultsUpdater = self
    // The results are the screen, not an overlay over a dimmed one.
    controller.obscuresBackgroundDuringPresentation = false
    return controller
  }()
  /// Wrapped in a navigation controller because that is how tvOS is documented
  /// to show a search container, and it is not a formality: presented bare, the
  /// system lays the search out in its compact form (one row of letters across
  /// the top, results underneath). Inside a navigation controller it gives the
  /// full-screen search layout instead - the letter grid down the left, results
  /// beside it - which is the one every tvOS media app shows.
  private lazy var containerViewController: UINavigationController = {
    let search = UISearchContainerViewController(searchController: searchController)
    let navigation = UINavigationController(rootViewController: search)
    navigation.isNavigationBarHidden = true
    return navigation
  }()

  private var attached = false
  /// The last text React asked for, so the round trip it causes through
  /// `updateSearchResults` is not reported back as if the user had typed it.
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

  // MARK: - props

  var placeholder: String = "" {
    didSet { searchController.searchBar.placeholder = placeholder }
  }

  /// Set the field from React (a query handed over by Siri, or a recent search
  /// the user picked). Ignored when it already says this, so typing is never
  /// fought over.
  func setText(_ text: String) {
    guard searchController.searchBar.text != text else { return }
    textFromReact = text
    searchController.searchBar.text = text
  }

  // MARK: - hosting

  /// The search container is a view controller, so it needs a parent one. There
  /// is no reliable handle to React's from here, so take the nearest up the
  /// responder chain: once in a window, that is the root view controller the app
  /// is mounted in.
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

  /// UIKit has decided how much room the results get. React lays its grid out in
  /// that area's own coordinates, so the size goes over as an event and the
  /// content view is pinned to the area itself.
  private func layoutResults(in bounds: CGRect) {
    content.frame = bounds
    guard bounds.size != reportedSize else { return }
    reportedSize = bounds.size
    onLayoutResults(["width": bounds.width, "height": bounds.height])
  }

  // MARK: - children

  // React's children belong to the results view controller, not to this view:
  // `self` is only the anchor that puts the search container on screen.

  public override func mountChildComponentView(_ childComponentView: UIView, index: Int) {
    content.insertSubview(childComponentView, at: min(index, content.subviews.count))
  }

  // `index` is unused: a view removes itself from wherever it was mounted.
  // The signature is UIKit's, so the parameter stays named for the override.
  public override func unmountChildComponentView(_ childComponentView: UIView, index _: Int) {
    childComponentView.removeFromSuperview()
  }

  // MARK: - UISearchResultsUpdating

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

/// A results view controller that says when it has been laid out. The search
/// container decides that geometry, and it is the only way to learn it.
private final class ResultsViewController: UIViewController {
  var onLayout: ((CGRect) -> Void)?

  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    onLayout?(view.bounds)
  }
}
