use serde::{Deserialize, Serialize};

/// How the core and a module's process reach each other. `kroma build` records
/// the one the bundled binary speaks; a bundle that records none was built
/// against an SDK that predates the socket seam, and is reached over loopback
/// TCP.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Seam {
    #[default]
    Tcp,
    Unix,
}

impl Seam {
    pub fn is_tcp(&self) -> bool {
        *self == Self::Tcp
    }
}

#[cfg(test)]
mod tests {
    use crate::ModuleManifest;

    use super::*;

    #[test]
    fn a_bundle_that_records_no_seam_speaks_tcp() {
        let legacy: ModuleManifest =
            serde_json::from_str(r#"{ "id": "a", "name": "A", "version": "1.0.0" }"#).unwrap();

        assert_eq!(legacy.seam, Seam::Tcp);
        assert!(serde_json::to_value(&legacy).unwrap().get("seam").is_none());
    }

    #[test]
    fn the_socket_seam_round_trips() {
        let built: ModuleManifest = serde_json::from_str(
            r#"{ "id": "a", "name": "A", "version": "1.0.0", "seam": "unix" }"#,
        )
        .unwrap();

        assert_eq!(built.seam, Seam::Unix);
        assert_eq!(serde_json::to_value(&built).unwrap()["seam"], "unix");
    }

    #[test]
    fn a_seam_this_build_cannot_speak_is_refused_rather_than_read_as_tcp() {
        let err = serde_json::from_str::<ModuleManifest>(
            r#"{ "id": "a", "name": "A", "version": "1.0.0", "seam": "pipe" }"#,
        )
        .unwrap_err()
        .to_string();

        assert!(err.contains("unknown variant"), "{err}");
    }
}
