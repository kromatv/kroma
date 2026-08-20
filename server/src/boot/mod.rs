//! Composition-root helpers. `main` stays the one place that names the whole
//! server; each submodule owns one thing it has to build.

pub mod background;
pub mod https;
pub mod scan;
pub mod serve;
pub mod startup;
pub mod state;
pub mod tracing;
pub mod transcriber;
