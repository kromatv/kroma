import ExpoModulesCore
import UIKit

public class FocusCardModule: Module {
  public func definition() -> ModuleDefinition {
    Name("FocusCard")

    View(FocusCardView.self) {
      Prop("holdsFocus") { (view: FocusCardView, holds: Bool) in
        view.setHoldsFocus(holds)
      }
      Prop("radius") { (view: FocusCardView, radius: Double) in
        view.styleRadius = radius
      }
      Prop("face") { (view: FocusCardView, face: String) in
        view.faceIsHost = face == "host"
      }
    }
  }
}

/// The effect of a tvOS card for a control the spatial navigator focuses, laid
/// over the control rather than around it so the control's layout never
/// changes. While the control holds the focus, the control itself tilts toward
/// the thumb in perspective and a soft shadow settles under it, and a broad
/// specular light slides against the tilt inside the control's own outline.
/// The tilt and the light are system motion effects, so they follow the remote
/// with no work on the JS thread. A large control tilts less, but never so
/// little that the tilt reads as a slide, and a list row does not tilt at all,
/// as on tvOS: it only lifts and catches the light.
public class FocusCardView: ExpoView {
  private static let tilt: CGFloat = 0.1
  private static let tiltReach: CGFloat = 320
  private static let minimumTilt: CGFloat = 0.045
  private static let rowWidth: CGFloat = 500
  private static let rowAspect: CGFloat = 3.5
  private static let depth: CGFloat = 1 / 900
  private static let lightStrength: CGFloat = 0.2
  private static let lightTravel: CGFloat = 0.6

  private let lightClip = UIView()
  private let light = UIView()
  private let glare = CAGradientLayer()
  private var holds = false
  private var outline = CGRect.zero
  private var radius: CGFloat = 0
  private weak var host: UIView?
  private var tiltEffect: UIMotionEffect?
  var styleRadius: CGFloat = 0
  var faceIsHost = false

  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    isUserInteractionEnabled = false
    lightClip.isUserInteractionEnabled = false
    lightClip.clipsToBounds = true
    lightClip.alpha = 0
    glare.type = .radial
    glare.colors = [
      UIColor(white: 1, alpha: Self.lightStrength).cgColor,
      UIColor(white: 1, alpha: Self.lightStrength * 0.35).cgColor,
      UIColor(white: 1, alpha: 0).cgColor,
    ]
    glare.locations = [0, 0.35, 1]
    glare.startPoint = CGPoint(x: 0.5, y: 0.5)
    glare.endPoint = CGPoint(x: 1, y: 1)
    light.layer.addSublayer(glare)
    lightClip.addSubview(light)
    addSubview(lightClip)
  }

  func setHoldsFocus(_ on: Bool) {
    guard on != holds else { return }
    holds = on
    if on { engage() } else { release() }
  }

  public override func didMoveToSuperview() {
    super.didMoveToSuperview()
    if superview == nil { release() } else if holds { engage() }
  }

  public override func layoutSubviews() {
    super.layoutSubviews()
    fitShape()
    if holds { follow() }
  }

  private func engage() {
    guard let control = superview else { return }
    host = control
    fitShape()
    follow()
    UIView.animate(withDuration: 0.25, delay: 0, options: [.curveEaseOut, .beginFromCurrentState]) {
      self.lightClip.alpha = 1
    }
    shadow(on: true, of: control)
  }

  private func release() {
    light.motionEffects.forEach { light.removeMotionEffect($0) }
    if let control = host, let tiltEffect {
      control.removeMotionEffect(tiltEffect)
      shadow(on: false, of: control)
    }
    tiltEffect = nil
    UIView.animate(withDuration: 0.2, delay: 0, options: [.curveEaseOut, .beginFromCurrentState]) {
      self.lightClip.alpha = 0
    }
  }

  private func follow() {
    guard let control = host else { return }
    if let tiltEffect { control.removeMotionEffect(tiltEffect) }
    light.motionEffects.forEach { light.removeMotionEffect($0) }

    let size = max(outline.width, outline.height)
    let row = outline.width > Self.rowWidth && outline.width > outline.height * Self.rowAspect
    let angle = row ? 0 : max(Self.minimumTilt, Self.tilt * min(1, Self.tiltReach / max(size, 1)))
    var base = CATransform3DIdentity
    base.m34 = -Self.depth
    let x = UIInterpolatingMotionEffect(keyPath: "layer.transform", type: .tiltAlongHorizontalAxis)
    x.minimumRelativeValue = NSValue(caTransform3D: CATransform3DRotate(base, -angle, 0, 1, 0))
    x.maximumRelativeValue = NSValue(caTransform3D: CATransform3DRotate(base, angle, 0, 1, 0))
    let y = UIInterpolatingMotionEffect(keyPath: "layer.transform", type: .tiltAlongVerticalAxis)
    y.minimumRelativeValue = NSValue(caTransform3D: CATransform3DRotate(base, angle, 1, 0, 0))
    y.maximumRelativeValue = NSValue(caTransform3D: CATransform3DRotate(base, -angle, 1, 0, 0))
    let tilt = UIMotionEffectGroup()
    tilt.motionEffects = [x, y]
    control.addMotionEffect(tilt)
    tiltEffect = tilt

    let lx = UIInterpolatingMotionEffect(keyPath: "center.x", type: .tiltAlongHorizontalAxis)
    lx.minimumRelativeValue = outline.width * Self.lightTravel
    lx.maximumRelativeValue = -outline.width * Self.lightTravel
    let ly = UIInterpolatingMotionEffect(keyPath: "center.y", type: .tiltAlongVerticalAxis)
    ly.minimumRelativeValue = outline.height * Self.lightTravel
    ly.maximumRelativeValue = -outline.height * Self.lightTravel
    let glide = UIMotionEffectGroup()
    glide.motionEffects = [lx, ly]
    light.addMotionEffect(glide)
  }

  private func shadow(on: Bool, of control: UIView) {
    let layer = control.layer
    layer.shadowColor = UIColor.black.cgColor
    layer.shadowPath = UIBezierPath(roundedRect: outline, cornerRadius: radius).cgPath
    ease(layer, "shadowOpacity", Float(on ? 0.45 : 0))
    ease(layer, "shadowRadius", on ? 24 : 8)
    ease(layer, "shadowOffset", NSValue(cgSize: CGSize(width: 0, height: on ? 18 : 4)))
  }

  private func ease(_ target: CALayer, _ key: String, _ value: Any) {
    let animation = CABasicAnimation(keyPath: key)
    animation.fromValue = target.presentation()?.value(forKeyPath: key) ?? target.value(forKeyPath: key)
    animation.toValue = value
    animation.duration = 0.25
    animation.timingFunction = CAMediaTimingFunction(name: .easeOut)
    target.setValue(value, forKeyPath: key)
    target.add(animation, forKey: key)
  }

  /// The outline the light and the shadow take: the control itself when it
  /// paints its own face, else its face, the first of its views that is not
  /// this one, with the radius its style declares.
  /// Only a square face that a rounded view inside nearly fills (a poster's
  /// artwork) takes that view's outline, never a small rounded part of it.
  private func fitShape() {
    guard let control = superview else { return }
    let face = faceIsHost ? nil : control.subviews.first { $0 !== self }
    var rect = face?.frame ?? control.bounds
    var corner = styleRadius > 0 ? styleRadius : ((face ?? control).layer.cornerRadius)
    if corner == 0, let face,
      let inner = face.subviews.first(where: {
        $0.layer.cornerRadius > 0 && $0.frame.width >= face.bounds.width * 0.9
          && $0.frame.height >= face.bounds.height * 0.6
      })
    {
      rect = face.convert(inner.frame, to: control)
      corner = inner.layer.cornerRadius
    }
    outline = rect
    radius = corner
    let local = convert(rect, from: control)
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    lightClip.frame = local
    lightClip.layer.cornerRadius = corner
    let reach = max(rect.width, rect.height) * 1.8
    light.bounds = CGRect(x: 0, y: 0, width: reach, height: reach)
    light.center = CGPoint(x: rect.width / 2, y: rect.height * 0.1)
    glare.frame = light.bounds
    CATransaction.commit()
  }
}
