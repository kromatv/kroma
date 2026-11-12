//! Composition-root helpers. `main` stays the one place that names the whole
//! server; each submodule owns one thing it has to build.

#[cfg(target_os = "linux")]
pub mod allocator;
pub mod background;
#[cfg(unix)]
pub mod folders;
#[cfg(feature = "hotpatch")]
pub mod hot;
pub mod https;
pub mod scan;
pub mod seam;
pub mod serve;
pub mod startup;
pub mod state;
pub mod tracing;
pub mod transcriber;
