//! The Rokus this server has seen, and what the channel installer did to each.

use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::Mutex;

use serde::Serialize;
use tracing::{info, warn};

use kroma_module_sdk::primitives::now_iso8601;

use crate::address::DeviceAddress;
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
    #[serde(rename = "ip")]
    pub address: DeviceAddress,
    pub software_version: String,
    pub developer_enabled: bool,
    pub last_seen: String,
    pub install: Install,
}

pub struct Roku {
    devices: Mutex<BTreeMap<String, Device>>,
    dir: PathBuf,
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
                address: found.address,
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
            let address = f.address;
            let info = tokio::task::spawn_blocking(move || ecp::device_info(address)).await;
            match info {
                Ok(Ok(info)) => self.remember(&f, info),
                Ok(Err(e)) => {
                    warn!(serial = %f.serial, error = %format!("{e:#}"), "roku: device-info failed")
                }
                Err(_) => {}
            }
        }
    }

    pub async fn add(&self, address: DeviceAddress) -> anyhow::Result<Device> {
        let info = tokio::task::spawn_blocking(move || ecp::device_info(address)).await??;
        if info.serial.is_empty() {
            anyhow::bail!("{address} answered without a serial number");
        }
        let found = discovery::Found {
            serial: info.serial.clone(),
            address,
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
        let address = device.address;
        let outcome =
            tokio::task::spawn_blocking(move || installer::install(address, &password, &zip)).await;
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
        let address = device.address;
        let result =
            tokio::task::spawn_blocking(move || ecp::launch_dev(address, &server_url)).await;
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
            address: DeviceAddress::parse("192.168.1.134").expect("a private address"),
        }
    }

    #[test]
    fn the_wire_shape_the_console_reads_is_camel_cased() {
        let roku = Roku::new(PathBuf::from("/nowhere"));
        roku.remember(
            &found("P0A070000007"),
            ecp::DeviceInfo {
                serial: "P0A070000007".into(),
                name: "Salon".into(),
                model: "Roku Ultra".into(),
                software_version: "13.1.4".into(),
                developer_enabled: true,
            },
        );
        roku.set_install(
            "P0A070000007",
            InstallStatus::Failed,
            Some("password".into()),
        );

        let device = serde_json::to_value(roku.device("P0A070000007").unwrap()).unwrap();

        let at = device["install"]["at"].clone();
        assert_eq!(
            device,
            serde_json::json!({
                "serial": "P0A070000007",
                "name": "Salon",
                "model": "Roku Ultra",
                "ip": "192.168.1.134",
                "softwareVersion": "13.1.4",
                "developerEnabled": true,
                "lastSeen": device["lastSeen"].clone(),
                "install": { "status": "failed", "message": "password", "at": at },
            })
        );
    }

    #[tokio::test]
    async fn a_serial_no_box_answered_under_is_neither_installed_on_nor_launched() {
        let roku = Roku::new(PathBuf::from("/nowhere"));

        roku.install("ghost", "http://192.168.1.20:4040".into())
            .await;
        roku.launch("ghost", "http://192.168.1.20:4040".into())
            .await;

        assert!(roku.device("ghost").is_none());
        assert!(roku.devices().is_empty());
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
        assert_eq!(device.address.to_string(), "192.168.1.134");
        assert_eq!(device.install.status, InstallStatus::Installed);
    }

    #[test]
    fn the_embedded_channel_is_a_zip_holding_a_manifest() {
        assert_eq!(&CHANNEL_ZIP[..2], b"PK");
        assert!(String::from_utf8_lossy(CHANNEL_ZIP).contains("manifest"));
    }

    #[test]
    fn the_zip_is_written_once_and_rewritten_when_the_bytes_moved() {
        let scratch = kroma_module_sdk::testing::temp_dir("roku-zip");
        let roku = Roku::new(scratch.path().to_path_buf());

        let path = roku.ensure_zip().unwrap();
        std::fs::write(&path, b"stale").unwrap();
        roku.ensure_zip().unwrap();

        assert_eq!(std::fs::read(&path).unwrap(), CHANNEL_ZIP);
    }
}
