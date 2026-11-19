//! The Linux render node VAAPI and QSV open.

use std::path::Path;
use std::sync::OnceLock;

// A host with several (an iGPU beside a card) names the one it means with
// `KROMA_RENDER_NODE`, because that choice belongs to an operator, not a probe.
const DEFAULT: &str = "/dev/dri/renderD128";

pub(super) fn path() -> &'static str {
    static NODE: OnceLock<&str> = OnceLock::new();
    NODE.get_or_init(|| match std::env::var("KROMA_RENDER_NODE") {
        Ok(v) if !v.trim().is_empty() => Box::leak(v.trim().to_owned().into_boxed_str()),
        _ => DEFAULT,
    })
}

pub(super) fn openable() -> Result<(), String> {
    openable_at(path())
}

// The render node is opened here rather than left to ffmpeg because the failure
// an operator has to act on - the service user is not in the group that owns it -
// is otherwise buried in a driver's own error text.
fn openable_at(node: &str) -> Result<(), String> {
    if !Path::new(node).exists() {
        return Err(format!("{node} does not exist"));
    }
    std::fs::OpenOptions::new()
        .read(true)
        .write(true)
        .open(node)
        .map(|_| ())
        .map_err(|e| match e.kind() {
            std::io::ErrorKind::PermissionDenied => format!(
                "{node} is not readable by this user (on DSM, the package user must \
                 join the `videodriver` group; in Docker, pass --device {node})"
            ),
            _ => format!("{node} could not be opened: {e}"),
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_render_node_that_is_not_there_says_so_rather_than_failing_silently() {
        let why = openable_at("/dev/dri/renderD-nope").unwrap_err();

        assert!(why.contains("does not exist"), "{why}");
    }
}
