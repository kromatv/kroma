//! The Rokus this server has seen, and what the channel installer did to each.

use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::Mutex;

use serde::Serialize;
use tracing::{info, warn};

use kroma_module_sdk::primitives::now_iso8601;

use crate::installer::Outcome;
use crate::{config, discovery, ecp, installer};

const CHANNEL_ZIP: &[u8] = include_bytes!(concat!(env!("OUT_DIR"), "/channel.zip"));

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Install {
    pub status: InstallStatus,
    pub message: Option<String>,
    pub at: Option<String>,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum InstallStatus {
    #[default]
    None,
    Installing,
    Installed,
    Failed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Device {
    pub serial: String,
    pub name: String,
    pub model: String,
    pub ip: String,
    pub software_version: String,
    pub developer_enabled: bool,
    pub last_seen: String,
    pub install: Install,
}

pub struct Roku {
    devices: Mutex<BTreeMap<String, Device>>,
    dir: PathBuf,
}

pub fn ip_of(location: &str) -> String {
    let host = location
        .trim_start_matches("http://")
        .trim_start_matches("https://");
    host.split(['/', ':'])
        .next()
        .unwrap_or_default()
        .to_string()
}

impl Roku {
    pub fn new(dir: PathBuf) -> Self {
        Self {
            devices: Mutex::new(BTreeMap::new()),
            dir,
        }
    }

    pub fn password(&self) -> String {
        config::read(&self.dir).dev_password
    }

    pub fn set_password(&self, password: &str) -> anyhow::Result<()> {
        config::write(
            &self.dir,
            &config::Config {
                dev_password: password.trim().to_string(),
            },
        )
    }

    pub fn devices(&self) -> Vec<Device> {
        self.devices.lock().unwrap().values().cloned().collect()
    }

    pub fn remember(&self, found: &discovery::Found, info: ecp::DeviceInfo) {
        let mut devices = self.devices.lock().unwrap();
        let install = devices
            .get(&found.serial)
            .map(|d| d.install.clone())
            .unwrap_or_default();
        devices.insert(
            found.serial.clone(),
            Device {
                serial: found.serial.clone(),
                name: info.name,
                model: info.model,
                ip: ip_of(&found.location),
                software_version: info.software_version,
                developer_enabled: info.developer_enabled,
                last_seen: now_iso8601(),
                install,
            },
        );
    }

    pub async fn scan(&self) {
        let found = match discovery::search().await {
            Ok(found) => found,
            Err(e) => {
                warn!(error = %format!("{e:#}"), "roku: discovery failed");
                return;
            }
        };
        for f in found {
            let base = f.location.clone();
            let info = tokio::task::spawn_blocking(move || ecp::device_info(&base)).await;
            match info {
                Ok(Ok(info)) => self.remember(&f, info),
                Ok(Err(e)) => {
                    warn!(serial = %f.serial, error = %format!("{e:#}"), "roku: device-info failed")
                }
                Err(_) => {}
            }
        }
    }

    pub async fn add(&self, ip: &str) -> anyhow::Result<Device> {
        let base = format!("http://{ip}:8060");
        let info = tokio::task::spawn_blocking(move || ecp::device_info(&base)).await??;
        if info.serial.is_empty() {
            anyhow::bail!("{ip} answered without a serial number");
        }
        let found = discovery::Found {
            serial: info.serial.clone(),
            location: format!("http://{ip}:8060"),
        };
        self.remember(&found, info);
        Ok(self.device(&found.serial).expect("just remembered"))
    }

    pub fn device(&self, serial: &str) -> Option<Device> {
        self.devices.lock().unwrap().get(serial).cloned()
    }

    fn set_install(&self, serial: &str, status: InstallStatus, message: Option<String>) {
        if let Some(d) = self.devices.lock().unwrap().get_mut(serial) {
            d.install = Install {
                status,
                message,
                at: Some(now_iso8601()),
            };
        }
    }

    fn ensure_zip(&self) -> anyhow::Result<PathBuf> {
        let zip = self.dir.join("channel.zip");
        if std::fs::read(&zip).ok().as_deref() != Some(CHANNEL_ZIP) {
            std::fs::create_dir_all(&self.dir)?;
            std::fs::write(&zip, CHANNEL_ZIP)?;
        }
        Ok(zip)
    }

    pub async fn install(&self, serial: &str, server_url: String) {
        let Some(device) = self.device(serial) else {
            return;
        };
        let password = self.password();
        self.set_install(serial, InstallStatus::Installing, None);
        let zip = match self.ensure_zip() {
            Ok(zip) => zip,
            Err(e) => {
                self.set_install(serial, InstallStatus::Failed, Some(format!("{e:#}")));
                return;
            }
        };
        let ip = device.ip.clone();
        let outcome =
            tokio::task::spawn_blocking(move || installer::install(&ip, &password, &zip)).await;
        let (status, message) = match outcome {
            Ok(Ok(Outcome::Installed)) | Ok(Ok(Outcome::Unchanged)) => {
                (InstallStatus::Installed, None)
            }
            Ok(Ok(Outcome::WrongPassword)) => (InstallStatus::Failed, Some("password".into())),
            Ok(Ok(Outcome::Refused(why))) => (InstallStatus::Failed, Some(why)),
            Ok(Err(e)) => (InstallStatus::Failed, Some(format!("{e:#}"))),
            Err(_) => (InstallStatus::Failed, Some("install task died".into())),
        };
        info!(serial, ?status, "roku: channel install");
        self.set_install(serial, status, message);
        if status == InstallStatus::Installed {
            self.launch(serial, server_url).await;
        }
    }

    pub async fn launch(&self, serial: &str, server_url: String) {
        let Some(device) = self.device(serial) else {
            return;
        };
        let base = format!("http://{}:8060", device.ip);
        let result = tokio::task::spawn_blocking(move || ecp::launch_dev(&base, &server_url)).await;
        if let Ok(Err(e)) = result {
            warn!(serial, error = %format!("{e:#}"), "roku: launch failed");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn found(serial: &str) -> discovery::Found {
        discovery::Found {
            serial: serial.into(),
            location: "http://192.168.1.134:8060".into(),
        }
    }

    #[test]
    fn the_address_is_the_host_of_the_ecp_location() {
        assert_eq!(ip_of("http://192.168.1.134:8060"), "192.168.1.134");
        assert_eq!(ip_of("http://192.168.1.134:8060/"), "192.168.1.134");
    }

    #[test]
    fn a_box_seen_again_keeps_what_the_installer_did_to_it() {
        let roku = Roku::new(PathBuf::from("/nowhere"));
        roku.remember(&found("A1"), ecp::DeviceInfo::default());
        roku.set_install("A1", InstallStatus::Installed, None);

        roku.remember(
            &found("A1"),
            ecp::DeviceInfo {
                name: "Salon".into(),
                ..Default::default()
            },
        );

        let device = roku.device("A1").unwrap();
        assert_eq!(device.name, "Salon");
        assert_eq!(device.ip, "192.168.1.134");
        assert_eq!(device.install.status, InstallStatus::Installed);
    }

    #[test]
    fn the_embedded_channel_is_a_zip_holding_a_manifest() {
        assert_eq!(&CHANNEL_ZIP[..2], b"PK");
        assert!(String::from_utf8_lossy(CHANNEL_ZIP).contains("manifest"));
    }

    #[test]
    fn the_zip_is_written_once_and_rewritten_when_the_bytes_moved() {
        let dir = std::env::temp_dir().join(format!("kroma-roku-{}", std::process::id()));
        let roku = Roku::new(dir.clone());

        let path = roku.ensure_zip().unwrap();
        std::fs::write(&path, b"stale").unwrap();
        roku.ensure_zip().unwrap();

        assert_eq!(std::fs::read(&path).unwrap(), CHANNEL_ZIP);
        std::fs::remove_dir_all(dir).ok();
    }
}
