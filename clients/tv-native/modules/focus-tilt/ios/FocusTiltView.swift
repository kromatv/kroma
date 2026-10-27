import ExpoModulesCore
import UIKit

/// The focus parallax tvOS gives a poster it focuses itself, for a control the
/// spatial navigator focuses instead: while `active`, the content tilts toward
/// the thumb on the remote, a highlight slides the other way and the shadow
/// deepens, all on the UI thread.
public final class FocusTiltView: ExpoView {
  private static let maxAngle: CGFloat = .pi / 36
  private static let drift: CGFloat = 4
  private static let depth: CGFloat = 900
  private static let follow: CFTimeInterval = 0.12
  private static let settle: CFTimeInterval = 0.4

  private let shade = UIView()
  private let content = UIView()
  private let sheen = UIView()
  private let glare = CAGradientLayer()
  private var active = false
  private var fitted: (size: CGSize, radius: CGFloat)?

  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    shade.isUserInteractionEnabled = false
    shade.layer.shadowColor = UIColor.black.cgColor
    shade.layer.shadowOpacity = 0
    addSubview(shade)
    content.layer.allowsEdgeAntialiasing = true
    addSubview(content)
    sheen.isUserInteractionEnabled = false
    sheen.clipsToBounds = true
    glare.type = .radial
    glare.colors = [UIColor(white: 1, alpha: 0.3).cgColor, UIColor(white: 1, alpha: 0).cgColor]
    glare.opacity = 0
    sheen.layer.addSublayer(glare)
    content.addSubview(sheen)
  }

  func setActive(_ on: Bool) {
    guard on != active else { return }
    active = on
    if on {
      RemoteTouchTilt.shared.follow(self)
    } else {
      RemoteTouchTilt.shared.release(self)
    }
  }

  public override func didMoveToWindow() {
    super.didMoveToWindow()
    if window == nil {
      RemoteTouchTilt.shared.release(self)
    } else if active {
      RemoteTouchTilt.shared.follow(self)
    }
  }

  public override func layoutSubviews() {
    super.layoutSubviews()
    shade.frame = bounds
    content.bounds = CGRect(origin: .zero, size: bounds.size)
    content.center = CGPoint(x: bounds.midX, y: bounds.midY)
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    sheen.frame = content.bounds
    glare.frame = sheen.bounds
    CATransaction.commit()
    fitCorners()
  }

  public override func mountChildComponentView(_ childComponentView: UIView, index: Int) {
    content.insertSubview(childComponentView, at: min(index, content.subviews.count - 1))
  }

  public override func unmountChildComponentView(_ childComponentView: UIView, index _: Int) {
    childComponentView.removeFromSuperview()
  }

  func tilt(x: CGFloat, y: CGFloat, settle: Bool) {
    fitCorners()
    let duration = settle ? Self.settle : Self.follow
    var turn = CATransform3DIdentity
    turn.m34 = -1 / Self.depth
    turn = CATransform3DTranslate(turn, x * Self.drift, y * Self.drift, 0)
    turn = CATransform3DRotate(turn, x * Self.maxAngle, 0, 1, 0)
    turn = CATransform3DRotate(turn, -y * Self.maxAngle, 1, 0, 0)
    let lift = min(1, hypot(x, y))
    let light = CGPoint(x: 0.5 - x * 0.5, y: 0.5 - y * 0.5)
    ease(content.layer, "transform", NSValue(caTransform3D: turn), duration)
    ease(glare, "startPoint", NSValue(cgPoint: light), duration)
    ease(glare, "endPoint", NSValue(cgPoint: CGPoint(x: light.x + 0.7, y: light.y + 0.7)), duration)
    ease(glare, "opacity", Float(lift), duration)
    ease(shade.layer, "shadowOpacity", Float(0.35 * lift), duration)
    ease(shade.layer, "shadowRadius", 12 + 12 * lift, duration)
    ease(shade.layer, "shadowOffset", NSValue(cgSize: CGSize(width: -x * 6, height: 10 + 6 * lift)), duration)
  }

  private func fitCorners() {
    let art = content.subviews.first { $0 !== sheen }
    let radius = art?.layer.cornerRadius ?? 0
    if let fitted, fitted.size == bounds.size, fitted.radius == radius { return }
    fitted = (bounds.size, radius)
    sheen.layer.cornerRadius = radius
    shade.layer.shadowPath = UIBezierPath(roundedRect: bounds, cornerRadius: radius).cgPath
  }

  private func ease(_ target: CALayer, _ key: String, _ value: Any, _ duration: CFTimeInterval) {
    let animation = CABasicAnimation(keyPath: key)
    animation.fromValue = target.presentation()?.value(forKeyPath: key) ?? target.value(forKeyPath: key)
    animation.toValue = value
    animation.duration = duration
    animation.timingFunction = CAMediaTimingFunction(name: .easeOut)
    target.setValue(value, forKeyPath: key)
    target.add(animation, forKey: key)
  }
}
