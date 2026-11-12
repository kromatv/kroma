//! Text subtitle files that sit beside a video rather than inside it.

mod convert;
mod decode;

pub use convert::to_vtt;
pub use kroma_primitives::external_subtitles::{beside, ExternalSubtitle, SUBTITLE_FOLDERS};
