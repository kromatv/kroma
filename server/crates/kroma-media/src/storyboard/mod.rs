//! The pieces a scrub-bar preview is made of: the grid a runtime settles on,
//! one tile grabbed at a timestamp, and the tiles laid out as one sheet.

mod plan;
mod sheet;
mod tile;

pub use plan::{Plan, TILE_H, TILE_W};
pub use sheet::{encode_jpeg, montage};
pub use tile::{fill_gaps, grab_tiles, probe, Decode};
