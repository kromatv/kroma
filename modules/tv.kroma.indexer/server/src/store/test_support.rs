use std::io::{BufRead, BufReader, Write};
use std::net::TcpListener;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;

use flate2::write::GzEncoder;
use flate2::Compression;
use tar::{Builder, Header};

use super::DefinitionStore;

pub(super) fn tmpdir(tag: &str) -> kroma_module_sdk::testing::TempDir {
    kroma_module_sdk::testing::temp_dir(&format!("store-test-{tag}"))
}

pub(super) fn valid_definition(id: &str) -> String {
    format!(
        r#"
id: {id}
name: My Tracker
caps:
  modes:
    search: [q]
search:
  rows:
    selector: "tr"
"#
    )
}

pub(super) fn scratch(label: &str) -> kroma_module_sdk::testing::TempDir {
    kroma_module_sdk::testing::temp_dir(&format!("defs-{label}"))
}

pub(super) const DEMO_YML: &str = "\
id: demo
name: Demo Tracker
type: public
description: A tracker for the tests
links:
  - https://demo.example/
caps: {}
search:
  rows: {}
";

pub(super) fn tarball(layout: &[(&str, &str)]) -> Vec<u8> {
    let mut archive = Builder::new(GzEncoder::new(Vec::new(), Compression::fast()));
    for (path, body) in layout {
        let mut header = Header::new_gnu();
        header.set_size(body.len() as u64);
        header.set_mode(0o644);
        header.set_cksum();
        archive
            .append_data(&mut header, path, body.as_bytes())
            .unwrap();
    }
    archive.into_inner().unwrap().finish().unwrap()
}

pub(super) fn serve(status: u16, body: Vec<u8>) -> String {
    counted(status, body).0
}

pub(super) fn counted(status: u16, body: Vec<u8>) -> (String, Arc<AtomicUsize>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    let served = Arc::new(AtomicUsize::new(0));
    let counting = Arc::clone(&served);
    std::thread::spawn(move || {
        for stream in listener.incoming() {
            let Ok(mut stream) = stream else { break };
            counting.fetch_add(1, Ordering::SeqCst);
            let mut reader = BufReader::new(stream.try_clone().unwrap());
            loop {
                let mut line = String::new();
                if reader.read_line(&mut line).unwrap_or(0) == 0 || line == "\r\n" {
                    break;
                }
            }
            let head = format!(
                "HTTP/1.1 {status} X\r\nContent-Length: {}\r\nContent-Type: application/gzip\r\nConnection: close\r\n\r\n",
                body.len()
            );
            let _ = stream.write_all(head.as_bytes());
            let _ = stream.write_all(&body);
            let _ = stream.flush();
        }
    });
    (format!("http://127.0.0.1:{port}/master.tar.gz"), served)
}

pub(super) struct TempStore {
    store: DefinitionStore,
    _dir: kroma_module_sdk::testing::TempDir,
}

impl std::ops::Deref for TempStore {
    type Target = DefinitionStore;

    fn deref(&self) -> &DefinitionStore {
        &self.store
    }
}

pub(super) fn store_for(source: String) -> TempStore {
    let dir = scratch("cache");
    TempStore {
        store: DefinitionStore {
            dir: dir.path().to_path_buf(),
            source,
            route: Ok(None),
        },
        _dir: dir,
    }
}
