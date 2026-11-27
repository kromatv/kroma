use anyhow::{Result, anyhow, bail};
use kroma_module_sdk::http::Response;
use serde_json::Value;

use crate::{AddTorrentReq, QBittorrent, magnet_info_hash};

const ADD: &str = "/api/v2/torrents/add";
const BOUNDARY: &str = "kroma-qbittorrent-torrent-upload";
const POLLS: usize = 10;

const LINK_NOT_ADDED: &str = "qBittorrent accepted the link but listed no torrent from it in \
     time: the link did not serve a .torrent qBittorrent could read (a login or details page, \
     an expired link), qBittorrent already holds that torrent, or it is still fetching the \
     link. qBittorrent's log names the cause";

const FILE_NOT_LISTED: &str = "qBittorrent took the .torrent file but listed no new torrent \
     for it; it most likely holds that torrent already";

impl QBittorrent {
    /// Adds a magnet, a `.torrent` link, or the `.torrent` file itself when the
    /// caller fetched it, and answers the torrent's hash.
    pub fn add(&self, req: &AddTorrentReq) -> Result<String> {
        if let Some(bytes) = req.torrent_bytes {
            return self.add_file(req, bytes);
        }
        let known = magnet_info_hash(req.magnet_or_url);
        let before = self.hashes_unless_known(req.label, known.as_deref())?;
        let mut fields: Vec<(&str, &str)> =
            vec![("urls", req.magnet_or_url), ("category", req.label)];
        if let Some(dir) = req.download_dir {
            fields.push(("savepath", dir));
        }
        let url = format!("{}{ADD}", self.base);
        verdict(self.send(|f| f.post_form(&url, &fields))?)?;
        match known {
            Some(hash) => Ok(hash),
            None => self.newly_listed(req.label, &before, LINK_NOT_ADDED),
        }
    }

    fn add_file(&self, req: &AddTorrentReq, bytes: &[u8]) -> Result<String> {
        let known = req.info_hash.map(str::to_ascii_lowercase);
        let before = self.hashes_unless_known(req.label, known.as_deref())?;
        let body = upload_body(req, bytes);
        let url = format!("{}{ADD}", self.base);
        let content_type = format!("multipart/form-data; boundary={BOUNDARY}");
        verdict(self.send(|f| f.post_bytes(&url, &content_type, &body))?)?;
        match known {
            Some(hash) => Ok(hash),
            None => self.newly_listed(req.label, &before, FILE_NOT_LISTED),
        }
    }

    fn hashes_unless_known(&self, label: &str, known: Option<&str>) -> Result<Vec<String>> {
        match known {
            Some(_) => Ok(Vec::new()),
            None => self.hashes_in(label),
        }
    }

    fn hashes_in(&self, label: &str) -> Result<Vec<String>> {
        Ok(self
            .torrents_info(&[("category", label)])?
            .iter()
            .filter_map(|t| t.get("hash").and_then(Value::as_str))
            .map(str::to_string)
            .collect())
    }

    fn newly_listed(&self, label: &str, before: &[String], missing: &str) -> Result<String> {
        for _ in 0..POLLS {
            std::thread::sleep(self.poll);
            let now = self.hashes_in(label)?;
            if let Some(hash) = now.into_iter().find(|h| !before.contains(h)) {
                return Ok(hash);
            }
        }
        Err(anyhow!("{missing}"))
    }
}

fn verdict(resp: Response) -> Result<()> {
    if resp.status == 415 {
        bail!("qBittorrent refused the .torrent file as invalid");
    }
    let resp = resp.ensure_ok()?;
    if resp.text().contains("Fails") {
        bail!("qBittorrent rejected the torrent");
    }
    Ok(())
}

fn upload_body(req: &AddTorrentReq, bytes: &[u8]) -> Vec<u8> {
    let mut body = Vec::with_capacity(bytes.len() + 512);
    let mut text = |name: &str, value: &str| {
        body.extend_from_slice(
            format!(
                "--{BOUNDARY}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n{value}\r\n"
            )
            .as_bytes(),
        );
    };
    text("category", req.label);
    if let Some(dir) = req.download_dir {
        text("savepath", dir);
    }
    body.extend_from_slice(
        format!(
            "--{BOUNDARY}\r\nContent-Disposition: form-data; name=\"torrents\"; \
             filename=\"kroma.torrent\"\r\nContent-Type: application/x-bittorrent\r\n\r\n"
        )
        .as_bytes(),
    );
    body.extend_from_slice(bytes);
    body.extend_from_slice(format!("\r\n--{BOUNDARY}--\r\n").as_bytes());
    body
}
