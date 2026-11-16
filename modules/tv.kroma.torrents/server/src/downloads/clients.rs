use anyhow::{anyhow, bail, Result};

use crate::db::{self, DownloadClientRow};
use crate::{ClientDef, DownloadClient};

use super::DownloadManager;

impl DownloadManager {
    /// What a configured client downloads. The embedded engine is a torrent
    /// client whether it has started or not; an external one says so through its
    /// engine, and one nothing answers for downloads nothing.
    pub fn protocols_of(&self, row: &DownloadClientRow) -> Vec<String> {
        if row.kind == crate::engine::EMBEDDED_KIND {
            return vec![crate::engine::TORRENT.to_string()];
        }
        self.engine_for(row)
            .map(|engine| engine.protocols())
            .unwrap_or_default()
    }

    /// The client a grab of `protocol` goes to: the enabled one ranked first
    /// among those that download it.
    pub fn client_for(&self, protocol: &str) -> Result<DownloadClientRow> {
        let clients = db::enabled_download_clients(&*self.store().get()?)?;
        if clients.is_empty() {
            bail!("no enabled download client");
        }
        clients
            .into_iter()
            .find(|row| self.protocols_of(row).iter().any(|p| p == protocol))
            .ok_or_else(|| anyhow!("no enabled download client takes {protocol} downloads"))
    }

    /// Whether this client's engine is merely not up YET, rather than absent.
    /// Only the embedded engine warms up in the background; an external one is
    /// a daemon that is either reachable or not.
    pub fn engine_pending(&self, row: &DownloadClientRow) -> bool {
        row.kind == crate::engine::EMBEDDED_KIND && self.rqbit().is_none()
    }

    /// The engine for one configured client. The embedded one is the helper this
    /// module started; every other kind is a module answering the `download-client` point under
    /// that kind, so a client this module has never heard of works as soon as
    /// something is installed to answer for it.
    pub fn engine_for(&self, row: &DownloadClientRow) -> Result<Box<dyn DownloadClient>> {
        let def = ClientDef {
            kind: row.kind.clone(),
            url: row.url.clone(),
            username: row.username.clone(),
            password: row.password.clone(),
            settings: row.settings.clone(),
        };
        if def.kind == crate::engine::EMBEDDED_KIND {
            let engine = self.rqbit().ok_or_else(|| anyhow!("embedded engine not started"))?;
            return Ok(engine.client());
        }
        crate::engine::remote::RemoteEngine::new(&*self.host, def)
            .map(|e| Box::new(e) as Box<dyn DownloadClient>)
            .ok_or_else(|| anyhow!("no module provides the {:?} download client", row.kind))
    }
}

#[cfg(test)]
mod tests;
