//! Smart Hub preview "cards": a 640×360 landscape tile composited from a backdrop
//! + scrims + a category badge + the KROMA brand lockup + the title's logo
//! artwork, plus an optional resume progress bar. Encoded as JPEG.
//!
//! The title/meta line are shown by the carousel itself and deliberately not
//! baked in here. Brand lockup drawing lives in the [`brand`] submodule.

mod brand;

use std::sync::OnceLock;

use fontdue::Font;
use jpeg_encoder::{ColorType, Encoder};
use tiny_skia::{
    Color, FillRule, GradientStop, LinearGradient, Paint, PathBuilder, Pixmap, PixmapPaint, Point,
    PremultipliedColorU8, Rect, SpreadMode, Transform,
};

const W: u32 = 640;
const MARGIN: f32 = 28.0;
const ACCENT: (u8, u8, u8) = (242, 180, 66); // KROMA amber
const WHITE: (u8, u8, u8) = (245, 245, 247);

// Top-left category pill geometry (shared so the brand lockup can align to it).
const BADGE_SIZE: f32 = 20.0;
const BADGE_TRACKING: f32 = 2.0;
const BADGE_PAD_X: f32 = 16.0;
const BADGE_PAD_Y: f32 = 11.0;
const BADGE_H: f32 = BADGE_SIZE + BADGE_PAD_Y * 2.0;

fn font() -> &'static Font {
    static FONT: OnceLock<Font> = OnceLock::new();
    FONT.get_or_init(|| {
        let bytes =
            include_bytes!("../../../packages/ui/src/assets/fonts/HankenGrotesk.ttf") as &[u8];
        Font::from_bytes(bytes, fontdue::FontSettings::default()).expect("bundled font parses")
    })
}

pub struct Card<'a> {
    pub base_png: &'a [u8],
    pub label: &'a str,
    // Drawn only when present - deliberately no text fallback.
    pub logo_png: Option<&'a [u8]>,
    pub progress: Option<f32>,
}

/// Composite a card and encode it to JPEG. `None` if the base PNG can't decode.
pub fn render(card: &Card) -> Option<Vec<u8>> {
    let mut pm = Pixmap::decode_png(card.base_png).ok()?;
    // Every layout metric in this file is tuned for the 640×360 tile; a larger
    // base (the 1280×720 Top Shelf card) scales them all uniformly.
    let s = pm.width() as f32 / W as f32;

    paint_scrims(&mut pm);

    if let Some(logo) = card.logo_png.and_then(|b| Pixmap::decode_png(b).ok()) {
        let y = pm.height() as f32 - MARGIN * s - logo.height() as f32;
        pm.draw_pixmap(
            (MARGIN * s) as i32,
            y as i32,
            logo.as_ref(),
            &PixmapPaint::default(),
            Transform::identity(),
            None,
        );
    }

    if !card.label.is_empty() {
        paint_badge(&mut pm, &card.label.to_uppercase(), s);
    }

    // KROMA brand lockup, top-right, vertically centred on the badge row.
    brand::paint(&mut pm, (MARGIN + BADGE_H / 2.0) * s, s);

    if let Some(p) = card.progress {
        paint_progress(&mut pm, p.clamp(0.0, 1.0), s);
    }

    Some(encode_jpeg(&pm))
}

fn fill_vgradient(pm: &mut Pixmap, y0: f32, y1: f32, top: Color, bottom: Color) {
    if let Some(shader) = LinearGradient::new(
        Point::from_xy(0.0, y0),
        Point::from_xy(0.0, y1),
        vec![GradientStop::new(0.0, top), GradientStop::new(1.0, bottom)],
        SpreadMode::Pad,
        Transform::identity(),
    ) {
        let paint = Paint {
            shader,
            ..Default::default()
        };
        pm.fill_rect(
            Rect::from_xywh(0.0, 0.0, pm.width() as f32, pm.height() as f32).unwrap(),
            &paint,
            Transform::identity(),
            None,
        );
    }
}

fn paint_scrims(pm: &mut Pixmap) {
    let h = pm.height() as f32;
    // Bottom scrim so the title logo stays legible over bright art.
    fill_vgradient(
        pm,
        h * 0.4,
        h,
        Color::from_rgba8(0, 0, 0, 0),
        Color::from_rgba8(0, 0, 0, 225),
    );
    // Soft top scrim so the badge stays legible over bright art.
    fill_vgradient(
        pm,
        0.0,
        h * 0.32,
        Color::from_rgba8(0, 0, 0, 150),
        Color::from_rgba8(0, 0, 0, 0),
    );
}

fn paint_badge(pm: &mut Pixmap, text: &str, s: f32) {
    let f = font();
    let (size, tracking) = (BADGE_SIZE * s, BADGE_TRACKING * s);
    let (pad_x, pad_y) = (BADGE_PAD_X * s, BADGE_PAD_Y * s);
    let tw = text_width(f, text, size, tracking);
    let bw = tw + pad_x * 2.0;
    let bh = BADGE_H * s;
    let (x, y) = (MARGIN * s, MARGIN * s);

    if let Some(pill) = rounded_rect(x, y, bw, bh, bh / 2.0) {
        let mut bg = Paint::default();
        bg.set_color_rgba8(8, 8, 10, 200);
        bg.anti_alias = true;
        pm.fill_path(&pill, &bg, FillRule::Winding, Transform::identity(), None);
    }
    // Vertically centre the text in the pill (baseline ≈ top + pad + cap height).
    draw_text(
        pm,
        f,
        text,
        x + pad_x,
        y + pad_y + size * 0.82,
        &TextStyle {
            size,
            color: ACCENT,
            tracking,
        },
    );
}

fn paint_progress(pm: &mut Pixmap, frac: f32, s: f32) {
    let (w, y) = (pm.width() as f32, pm.height() as f32 - 10.0 * s);
    let (x0, x1) = (MARGIN * s, w - MARGIN * s);
    let mut tp = Paint::default();
    tp.set_color_rgba8(255, 255, 255, 70);
    pm.fill_rect(
        Rect::from_xywh(x0, y, x1 - x0, 4.0 * s).unwrap(),
        &tp,
        Transform::identity(),
        None,
    );
    if frac > 0.0 {
        let mut fp = Paint::default();
        fp.set_color_rgba8(ACCENT.0, ACCENT.1, ACCENT.2, 255);
        pm.fill_rect(
            Rect::from_xywh(x0, y, (x1 - x0) * frac, 4.0 * s).unwrap(),
            &fp,
            Transform::identity(),
            None,
        );
    }
}

fn rounded_rect(x: f32, y: f32, w: f32, h: f32, r: f32) -> Option<tiny_skia::Path> {
    let mut pb = PathBuilder::new();
    pb.move_to(x + r, y);
    pb.line_to(x + w - r, y);
    pb.quad_to(x + w, y, x + w, y + r);
    pb.line_to(x + w, y + h - r);
    pb.quad_to(x + w, y + h, x + w - r, y + h);
    pb.line_to(x + r, y + h);
    pb.quad_to(x, y + h, x, y + h - r);
    pb.line_to(x, y + r);
    pb.quad_to(x, y, x + r, y);
    pb.close();
    pb.finish()
}

#[derive(Clone, Copy)]
struct TextStyle {
    size: f32,
    color: (u8, u8, u8),
    tracking: f32,
}

fn draw_text(pm: &mut Pixmap, font: &Font, text: &str, x: f32, baseline: f32, style: &TextStyle) {
    let TextStyle {
        size,
        color,
        tracking,
    } = *style;
    let mut pen = x;
    for ch in text.chars() {
        let (m, bitmap) = font.rasterize(ch, size);
        blit_glyph(pm, &m, &bitmap, color, pen, baseline);
        pen += m.advance_width + tracking;
    }
}

fn blit_glyph(
    pm: &mut Pixmap,
    m: &fontdue::Metrics,
    bitmap: &[u8],
    color: (u8, u8, u8),
    pen: f32,
    baseline: f32,
) {
    if m.width == 0 || m.height == 0 {
        return;
    }
    let Some(mut glyph) = Pixmap::new(m.width as u32, m.height as u32) else {
        return;
    };
    let px = glyph.pixels_mut();
    for (i, &c) in bitmap.iter().enumerate() {
        let r = (color.0 as u16 * c as u16 / 255) as u8;
        let g = (color.1 as u16 * c as u16 / 255) as u8;
        let b = (color.2 as u16 * c as u16 / 255) as u8;
        if let Some(p) = PremultipliedColorU8::from_rgba(r, g, b, c) {
            px[i] = p;
        }
    }
    let gx = (pen + m.xmin as f32).round() as i32;
    let gy = (baseline - m.height as f32 - m.ymin as f32).round() as i32;
    pm.draw_pixmap(
        gx,
        gy,
        glyph.as_ref(),
        &PixmapPaint::default(),
        Transform::identity(),
        None,
    );
}

fn text_width(font: &Font, text: &str, size: f32, tracking: f32) -> f32 {
    let mut w = 0.0;
    for ch in text.chars() {
        w += font.metrics(ch, size).advance_width + tracking;
    }
    (w - tracking).max(0.0)
}

fn encode_jpeg(pm: &Pixmap) -> Vec<u8> {
    let data = pm.data();
    let mut rgb = Vec::with_capacity((pm.width() * pm.height() * 3) as usize);
    for px in data.chunks_exact(4) {
        rgb.extend_from_slice(&px[..3]);
    }
    let mut out = Vec::new();
    Encoder::new(&mut out, 82)
        .encode(&rgb, pm.width() as u16, pm.height() as u16, ColorType::Rgb)
        .expect("jpeg encode");
    out
}
