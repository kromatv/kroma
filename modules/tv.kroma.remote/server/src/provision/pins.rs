pub(crate) const VERSION: &str = "2026.10.7";

pub(crate) struct Asset {
    pub(crate) os: &'static str,
    pub(crate) arch: &'static str,
    pub(crate) name: &'static str,
    pub(crate) archive: bool,
    pub(crate) sha256: &'static str,
}

const ASSETS: &[Asset] = &[
    Asset {
        os: "linux",
        arch: "x86_64",
        name: "cloudflared-linux-amd64",
        archive: false,
        sha256: "1f99fb518b83dec2ba8d870a7cc991d82a77e6196295a3d2754ba17ab9f91872",
    },
    Asset {
        os: "linux",
        arch: "aarch64",
        name: "cloudflared-linux-arm64",
        archive: false,
        sha256: "3df43aedc9ff291d1735b5cb576cb97e0b157488796db2e32b28aecabb445775",
    },
    Asset {
        os: "linux",
        arch: "arm",
        name: "cloudflared-linux-arm",
        archive: false,
        sha256: "74f690f6707182839b63e0465726c7776dd63f0a174390b911d5d71f35cab94e",
    },
    Asset {
        os: "linux",
        arch: "x86",
        name: "cloudflared-linux-386",
        archive: false,
        sha256: "4823d2f038395617e04e4070601ab45c0c43f31f15ee7586be299e19ef49d46e",
    },
    Asset {
        os: "macos",
        arch: "x86_64",
        name: "cloudflared-darwin-amd64.tgz",
        archive: true,
        sha256: "02f3edfd87684dd5b705607688e4eb4b323f6e777b81e7b3a85af556aa356848",
    },
    Asset {
        os: "macos",
        arch: "aarch64",
        name: "cloudflared-darwin-arm64.tgz",
        archive: true,
        sha256: "3586ccf397e98e5f437e60e7c307ca6ac463e110580503af8bb8e6f9ebf831bd",
    },
    Asset {
        os: "windows",
        arch: "x86_64",
        name: "cloudflared-windows-amd64.exe",
        archive: false,
        sha256: "2493dbc168923bb3e59e5e7716f71deced92992eea9acd6e9d74f84ac7751343",
    },
    Asset {
        os: "windows",
        arch: "x86",
        name: "cloudflared-windows-386.exe",
        archive: false,
        sha256: "88c6b972b410db0e26745f593510d772c825a13c5a2374819e3f13a05b333082",
    },
];

pub(crate) fn asset() -> Option<&'static Asset> {
    ASSETS
        .iter()
        .find(|a| a.os == std::env::consts::OS && a.arch == std::env::consts::ARCH)
}

#[cfg(test)]
mod tests {
    use std::collections::HashSet;

    use super::*;

    #[test]
    fn pins_every_asset_to_a_lowercase_sha256() {
        for asset in ASSETS {
            assert_eq!(asset.sha256.len(), 64, "{}", asset.name);
            assert!(
                asset
                    .sha256
                    .bytes()
                    .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)),
                "{}",
                asset.name
            );
        }
    }

    #[test]
    fn pins_each_platform_and_each_download_once() {
        let platforms: HashSet<_> = ASSETS.iter().map(|a| (a.os, a.arch)).collect();
        let names: HashSet<_> = ASSETS.iter().map(|a| a.name).collect();

        assert_eq!(platforms.len(), ASSETS.len());
        assert_eq!(names.len(), ASSETS.len());
    }

    #[test]
    fn unpacks_only_the_macos_tarballs() {
        for asset in ASSETS {
            assert_eq!(
                asset.archive,
                asset.name.ends_with(".tgz"),
                "{}",
                asset.name
            );
        }
    }
}
