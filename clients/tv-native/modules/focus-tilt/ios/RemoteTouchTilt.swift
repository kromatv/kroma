import UIKit

/// Reads the thumb on the remote's touch surface for the one `FocusTiltView`
/// that is active. Its recognizer recognizes alongside every other one, so the
/// swipes that move the focus keep firing, and it is only in the window while
/// something tilts.
final class RemoteTouchTilt: NSObject, UIGestureRecognizerDelegate {
  static let shared = RemoteTouchTilt()

  private static let reach: CGFloat = 360

  private let pan = UIPanGestureRecognizer()
  private weak var target: FocusTiltView?

  override init() {
    super.init()
    pan.addTarget(self, action: #selector(panned(_:)))
    pan.allowedTouchTypes = [NSNumber(value: UITouch.TouchType.indirect.rawValue)]
    pan.cancelsTouchesInView = false
    pan.delaysTouchesBegan = false
    pan.delaysTouchesEnded = false
    pan.delegate = self
  }

  func follow(_ view: FocusTiltView) {
    if let previous = target, previous !== view {
      previous.tilt(x: 0, y: 0, settle: true)
    }
    target = view
    pan.setTranslation(.zero, in: pan.view)
    guard let window = view.window, pan.view !== window else { return }
    pan.view?.removeGestureRecognizer(pan)
    window.addGestureRecognizer(pan)
  }

  func release(_ view: FocusTiltView) {
    guard target === view else { return }
    view.tilt(x: 0, y: 0, settle: true)
    target = nil
    DispatchQueue.main.async { [weak self] in
      guard let self, self.target == nil else { return }
      self.pan.view?.removeGestureRecognizer(self.pan)
    }
  }

  @objc private func panned(_ gesture: UIPanGestureRecognizer) {
    guard let target else { return }
    switch gesture.state {
    case .began, .changed:
      guard !UIAccessibility.isReduceMotionEnabled else { return }
      let moved = gesture.translation(in: gesture.view)
      target.tilt(x: Self.unit(moved.x), y: Self.unit(moved.y), settle: false)
    default:
      target.tilt(x: 0, y: 0, settle: true)
    }
  }

  private static func unit(_ points: CGFloat) -> CGFloat {
    max(-1, min(1, points / reach))
  }

  func gestureRecognizer(
    _: UIGestureRecognizer,
    shouldRecognizeSimultaneouslyWith _: UIGestureRecognizer
  ) -> Bool {
    true
  }
}
