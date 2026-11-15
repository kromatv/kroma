//! `kroma-audit <module-dir> <component.wasm> [--json]`: what `kroma audit`
//! runs once it has built the module's component.

use std::path::PathBuf;
use std::process::ExitCode;

#[cfg(unix)]
fn main() -> ExitCode {
    let mut json = false;
    let mut paths = Vec::new();
    for arg in std::env::args().skip(1) {
        match arg.as_str() {
            "--json" => json = true,
            _ => paths.push(PathBuf::from(arg)),
        }
    }
    let [module_dir, component] = paths.as_slice() else {
        eprintln!("usage: kroma-audit <module-dir> <component.wasm> [--json]");
        return ExitCode::from(2);
    };
    match kroma_module_audit::audit(module_dir, component) {
        Ok(report) => {
            if json {
                println!("{}", serde_json::to_string(&report).unwrap_or_default());
            } else {
                print!("{}", report.render());
            }
            if report.undeclared() == 0 {
                ExitCode::SUCCESS
            } else {
                ExitCode::FAILURE
            }
        }
        Err(error) => {
            eprintln!("audit failed: {error:#}");
            ExitCode::from(2)
        }
    }
}

#[cfg(not(unix))]
fn main() -> ExitCode {
    let _ = PathBuf::new();
    eprintln!("kroma audit runs a module the way the server does, which needs a Unix host");
    ExitCode::from(2)
}
