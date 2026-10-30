//! Reading and re-encoding one media input, for whoever holds it.
//!
//! Nothing here knows a catalog: an input is a local file, a program is
//! named by whoever asked for it, and the engine is told the directory it may
//! write in rather than deriving one. A module links this crate and a database
//! never comes with it.

pub mod external_subtitles;
pub mod ffmpeg_gate;
pub mod ffmpeg_run;
pub mod hls;
pub mod input;
pub mod playlist;
pub mod probe;
pub mod program;
pub mod storyboard;
pub mod stream;
pub mod subtitles;
pub mod tmp_file;
pub mod video;

mod credential;
mod json_error;
mod meter;

pub use credential::Credential;
pub use meter::{ByteMeter, Unmetered};
