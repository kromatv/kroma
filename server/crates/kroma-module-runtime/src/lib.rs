//! The module runtime: every module is a WebAssembly component the server runs
//! in-process. Its `main` is [`module_main!`], which hands [`serve`] the module's
//! routes and a [`RemoteHost`] ([`HostCtx`](kroma_module_host::HostCtx)) that
//! asks the core over `/api/_host/*` for settings, events, sessions and jobs.
//!
//! Databases are a CAPABILITY, not part of the runtime: only a module built with
//! the `storage` feature opens one, and it opens two -- its own file, and the
//! core database behind the grant its manifest declared. A module without the
//! feature does not link SQLite at all.
//!
//! Built for any other target, a module still compiles, so its tests run on the
//! host, but it refuses to start.

#[cfg(any(target_family = "wasm", test))]
mod env;
#[cfg(any(target_family = "wasm", test))]
mod events;
#[cfg(target_family = "wasm")]
pub mod guest;
mod host_ctx;
#[cfg(any(target_family = "wasm", test))]
mod jobs;
#[cfg(any(target_family = "wasm", test))]
mod migrations;
mod remote_host;
mod serve;
#[cfg(all(test, unix))]
mod tests;

pub use remote_host::RemoteHost;
#[cfg(not(target_family = "wasm"))]
pub use serve::refuse_native;
pub use serve::{serve, serve_one};

/// A module's `main`: `wire` and the modules as [`serve`] takes them. A
/// WebAssembly component serves them; any other build says it cannot and exits
/// with a failure.
#[macro_export]
macro_rules! module_main {
    ($wire:expr, $modules:expr $(,)?) => {
        #[cfg(not(target_family = "wasm"))]
        fn main() -> ::std::process::ExitCode {
            $crate::refuse_native($wire, $modules)
        }

        #[cfg(target_family = "wasm")]
        fn main() {}

        #[cfg(target_family = "wasm")]
        const _: () = {
            struct Entry;

            fn start() -> ::anyhow::Result<()> {
                $crate::guest::block_on($crate::serve($wire, $modules))
            }

            impl $crate::guest::Guest for Entry {
                fn tick() -> bool {
                    $crate::guest::tick(start)
                }

                fn stop() {
                    $crate::guest::stop();
                }

                fn handle(request: $crate::guest::Request) -> $crate::guest::Response {
                    $crate::guest::handle(request, start)
                }
            }

            $crate::guest::export_module!(Entry with_types_in $crate::guest);
        };
    };
}
