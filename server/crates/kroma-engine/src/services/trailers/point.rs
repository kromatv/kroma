use std::fs::File;
use std::io::Write;
use std::path::Path;

use anyhow::{anyhow, bail, Result};
use serde::Deserialize;
use serde_json::json;

use kroma_module_host::Resolver;

/// The bare point the core calls to have a trailer fetched.
pub const POINT: &str = "trailer";

const FETCH_SECONDS: u32 = 10 * 60;
const SLICE_BYTES: u64 = 8 * 1024 * 1024;
const MAX_HEIGHT: u32 = 1080;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Fetched {
    bytes: u64,
}

fn call(
    resolve: &Resolver,
    method: &str,
    body: &serde_json::Value,
    max_time: u32,
) -> Result<kroma_http::Response> {
    let (base, token) = resolve().ok_or_else(|| anyhow!("no module answers {POINT}"))?;
    kroma_http::Loopback::new()
        .header("authorization", format!("Bearer {token}"))
        .max_time(max_time)
        .post_json(&format!("{base}/_port/{POINT}/{method}"), body)?
        .ensure_ok()
}

/// Have the module fetch `video`, then copy the finished file it holds into
/// `dest` a slice at a time, and let it forget its own copy.
pub(super) fn fetch_into(resolve: &Resolver, video: &str, dest: &Path) -> Result<u64> {
    let answer: Result<Fetched, String> = call(
        resolve,
        "fetch",
        &json!({ "video": video, "maxHeight": MAX_HEIGHT }),
        FETCH_SECONDS,
    )?
    .json()?;
    let fetched = answer.map_err(|reason| anyhow!(reason))?;
    let mut out = File::create(dest)?;
    let mut offset = 0u64;
    while offset < fetched.bytes {
        let slice = call(
            resolve,
            "read",
            &json!({ "video": video, "offset": offset, "length": SLICE_BYTES }),
            120,
        )?;
        if slice.body.is_empty() {
            bail!(
                "the module stopped answering at byte {offset} of {}",
                fetched.bytes
            );
        }
        out.write_all(&slice.body)?;
        offset += slice.body.len() as u64;
    }
    out.sync_all()?;
    let _ = call(resolve, "forget", &json!({ "video": video }), 30);
    Ok(fetched.bytes)
}
