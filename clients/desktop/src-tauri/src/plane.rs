// The picture's plane on Linux: one native X11 child window inside the app
// window, handed to mpv as its `--wid`. It sits above the page's pixels (an X
// child always does) and is SHAPED to the picture's box minus the chrome painted
// over it, so the page shows everywhere else: one toplevel, no transparency, no
// keep-above. Its background is black, so the X server paints black wherever
// mpv's own child has nothing yet (before the first frame, during a resize).
// Its input shape is empty, so pointer events fall through to the page.

use std::cell::RefCell;
use std::sync::atomic::{AtomicU64, Ordering};

use gtk::cairo::Region;
use gtk::gdk;
use gtk::glib::Cast;
use gtk::prelude::*;
use tauri::WebviewWindow;
use x11::xlib;

thread_local! {
    static PLANE: RefCell<Option<gdk::Window>> = const { RefCell::new(None) };
}

/// The plane's XID, readable from any thread; zero until `create` succeeds.
#[derive(Default)]
pub struct PlaneState {
    xid: AtomicU64,
}

impl PlaneState {
    pub fn xid(&self) -> Option<u64> {
        match self.xid.load(Ordering::Acquire) {
            0 => None,
            xid => Some(xid),
        }
    }
}

/// Create the plane inside `window`, the window's full size, showing nothing
/// until `set_region` is given a region. Main thread only. `None` on a backend
/// with no X11 window to embed into (Wayland), where mpv falls back to a window
/// of its own.
pub fn create(window: &WebviewWindow, state: &PlaneState) -> Option<u64> {
    let gtk_window = window.gtk_window().ok()?;
    gtk_window.realize();
    let parent = gtk_window.window()?;
    let attr = gdk::WindowAttr {
        window_type: gdk::WindowType::Child,
        wclass: gdk::WindowWindowClass::InputOutput,
        x: Some(0),
        y: Some(0),
        width: parent.width().max(1),
        height: parent.height().max(1),
        event_mask: gdk::EventMask::empty(),
        ..Default::default()
    };
    let plane = gdk::Window::new(Some(&parent), &attr);
    if !plane.ensure_native() {
        return None;
    }
    let xid = plane.downcast_ref::<gdkx11::X11Window>()?.xid();
    // SAFETY: GDK's default display is open for the life of the process, and
    // `xid` names a window this client just created; both are plain Xlib calls.
    unsafe {
        let display = gdkx11::ffi::gdk_x11_get_default_xdisplay();
        xlib::XSetWindowBackground(display, xid, 0);
    }
    plane.shape_combine_region(Some(&Region::create()), 0, 0);
    plane.input_shape_combine_region(&Region::create(), 0, 0);
    plane.show();
    plane.raise();
    PLANE.with(|slot| *slot.borrow_mut() = Some(plane));
    state.xid.store(u64::from(xid), Ordering::Release);
    Some(u64::from(xid))
}

/// The part of the plane that shows: the picture's box minus the chrome over
/// it. An empty region hides it. Main thread only.
pub fn set_region(region: &Region) {
    PLANE.with(|slot| {
        if let Some(plane) = slot.borrow().as_ref() {
            plane.shape_combine_region(Some(region), 0, 0);
            if let Some(xid) = plane.downcast_ref::<gdkx11::X11Window>().map(|w| w.xid()) {
                blacken_children(xid);
            }
        }
    });
}

// mpv creates its window with no background, so a pixel the shape uncovers
// keeps whatever was there until mpv's next frame: chrome that faded out, a cue
// that ended. A black background pixel on that window makes X paint the gap
// black at once. Idempotent, so it runs on every shape change and catches a
// window mpv recreated on a video-output switch.
fn blacken_children(plane: xlib::Window) {
    // SAFETY: plain Xlib calls on the default display; XQueryTree's list is
    // freed with XFree and never read past `count`.
    unsafe {
        let display = gdkx11::ffi::gdk_x11_get_default_xdisplay();
        let (mut root, mut parent) = (0, 0);
        let mut children: *mut xlib::Window = std::ptr::null_mut();
        let mut count = 0u32;
        let found = xlib::XQueryTree(
            display,
            plane,
            &mut root,
            &mut parent,
            &mut children,
            &mut count,
        );
        if found == 0 {
            return;
        }
        for i in 0..count as usize {
            xlib::XSetWindowBackground(display, *children.add(i), 0);
        }
        if !children.is_null() {
            xlib::XFree(children.cast());
        }
    }
}

/// Follow the window to its new size. Main thread only.
pub fn resize(window: &WebviewWindow) {
    let Ok(gtk_window) = window.gtk_window() else { return };
    let Some(parent) = gtk_window.window() else { return };
    PLANE.with(|slot| {
        if let Some(plane) = slot.borrow().as_ref() {
            plane.move_resize(0, 0, parent.width().max(1), parent.height().max(1));
        }
    });
}
