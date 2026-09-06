use std::sync::Mutex;

use serde::Deserialize;
use tauri::{State, WebviewWindow};

const MIN_SIDE: i32 = 16;

/// The picture's box, as fractions of the window, exactly as the shell also hands
/// it to mpv's `video-margin-ratio-*`. One rect drives both, so the plane and the
/// hole cannot disagree.
#[derive(Clone, Copy, Debug, Deserialize, PartialEq)]
pub struct HoleRect {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

/// The picture's box and the chrome painted over it. The plane shows through
/// the box minus every cover: exactly the pixels the page does not paint.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Shape {
    pub rect: Option<HoleRect>,
    pub covers: Vec<HoleRect>,
}

#[derive(Default)]
pub struct HoleState(Mutex<Shape>);

impl HoleState {
    fn store(&self, shape: &Shape) {
        if let Ok(mut slot) = self.0.lock() {
            slot.clone_from(shape);
        }
    }

    fn current(&self) -> Shape {
        self.0.lock().ok().map(|slot| slot.clone()).unwrap_or_default()
    }
}

/// The hole's pixel box in a `width` x `height` window, or `None` when the window
/// is unmapped or the fractions leave nothing worth cutting.
pub fn hole_pixels(hole: HoleRect, width: i32, height: i32) -> Option<(i32, i32, i32, i32)> {
    if width <= 0 || height <= 0 {
        return None;
    }
    if ![hole.x, hole.y, hole.w, hole.h].iter().all(|v| v.is_finite()) {
        return None;
    }
    let (w, h) = (f64::from(width), f64::from(height));
    let edge = |v: f64, side: f64| (v * side).round().clamp(0.0, side) as i32;
    let left = edge(hole.x, w);
    let top = edge(hole.y, h);
    let (box_w, box_h) = (edge(hole.x + hole.w, w) - left, edge(hole.y + hole.h, h) - top);
    if box_w < MIN_SIDE || box_h < MIN_SIDE {
        return None;
    }
    Some((left, top, box_w, box_h))
}

#[cfg(target_os = "linux")]
fn apply(window: &WebviewWindow, shape: &Shape) {
    use gtk::cairo::{RectangleInt, Region};
    use gtk::prelude::*;

    let Ok(gtk_window) = window.gtk_window() else { return };
    let Some(surface) = gtk_window.window() else { return };
    let (width, height) = (surface.width(), surface.height());
    let region = Region::create();
    let cut = shape.rect.and_then(|rect| hole_pixels(rect, width, height));
    if let Some((x, y, box_w, box_h)) = cut {
        if region
            .union_rectangle(&RectangleInt::new(x, y, box_w, box_h))
            .is_err()
        {
            return;
        }
        for cover in &shape.covers {
            if let Some((cx, cy, cw, ch)) = hole_pixels(*cover, width, height) {
                region.subtract_rectangle(&RectangleInt::new(cx, cy, cw, ch)).ok();
            }
        }
    }
    crate::plane::set_region(&region);
}

#[cfg(not(target_os = "linux"))]
fn apply(_window: &WebviewWindow, _shape: &Shape) {}

fn dispatch(window: &WebviewWindow, shape: Shape) {
    let target = window.clone();
    let _ = window.run_on_main_thread(move || apply(&target, &shape));
}

/// Show the mpv plane through the picture's box, minus every `covers` rectangle
/// so the chrome painted over the picture keeps its pixels. `rect` of `null`
/// hides the plane. WebKitGTK paints an opaque background whatever alpha it is
/// given, so shaping the plane is the only way it is ever visible.
#[tauri::command]
pub fn video_hole_set(
    window: WebviewWindow,
    state: State<'_, HoleState>,
    rect: Option<HoleRect>,
    covers: Vec<HoleRect>,
) {
    let shape = Shape { rect, covers };
    state.store(&shape);
    dispatch(&window, shape);
}

/// Re-cut the stored shape after the window changed size. Every rect is
/// fractional, so it survives the resize; only its pixels move.
pub fn refresh(window: &WebviewWindow, state: &HoleState) {
    let shape = state.current();
    if shape.rect.is_some() {
        dispatch(window, shape);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rect(x: f64, y: f64, w: f64, h: f64) -> HoleRect {
        HoleRect { x, y, w, h }
    }

    #[test]
    fn maps_fractions_onto_the_window() {
        assert_eq!(
            hole_pixels(rect(0.0, 0.25, 1.0, 0.5), 1280, 800),
            Some((0, 200, 1280, 400))
        );
    }

    #[test]
    fn clamps_a_box_that_runs_past_the_window() {
        assert_eq!(
            hole_pixels(rect(-0.5, 0.5, 2.0, 2.0), 1280, 800),
            Some((0, 400, 1280, 400))
        );
    }

    #[test]
    fn refuses_a_sliver() {
        assert_eq!(hole_pixels(rect(0.0, 0.0, 1.0, 0.01), 1280, 800), None);
        assert_eq!(hole_pixels(rect(0.0, 0.0, 0.001, 1.0), 1280, 800), None);
    }

    #[test]
    fn refuses_an_unmapped_window() {
        assert_eq!(hole_pixels(rect(0.0, 0.0, 1.0, 1.0), 0, 0), None);
    }

    #[test]
    fn refuses_a_rect_that_is_not_a_number() {
        assert_eq!(hole_pixels(rect(f64::NAN, 0.0, 1.0, 1.0), 1280, 800), None);
        assert_eq!(
            hole_pixels(rect(0.0, 0.0, f64::INFINITY, 1.0), 1280, 800),
            None
        );
    }

    #[test]
    fn a_full_bleed_box_cuts_the_whole_window() {
        assert_eq!(
            hole_pixels(rect(0.0, 0.0, 1.0, 1.0), 1280, 800),
            Some((0, 0, 1280, 800))
        );
    }

    #[test]
    fn keeps_the_stored_shape_for_a_resize() {
        let state = HoleState::default();
        assert_eq!(state.current(), Shape::default());
        let shape = Shape {
            rect: Some(rect(0.0, 0.1, 1.0, 0.8)),
            covers: vec![rect(0.0, 0.8, 1.0, 0.2)],
        };
        state.store(&shape);
        assert_eq!(state.current(), shape);
        state.store(&Shape::default());
        assert_eq!(state.current().rect, None);
    }
}
