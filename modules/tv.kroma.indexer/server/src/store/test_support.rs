// sync() runs against a real socket serving .tar.gz bytes: the transport is
// curl + the system tar, so this exercises the whole path.

use std::io::{BufRead, BufReader, Write};
use std::net::TcpListener;
use std::process::Command;

use super::DefinitionStore;

pub(super) fn tmpdir(tag: &str) -> kroma_testing::TempDir {
    kroma_testing::temp_dir(&format!("store-test-{tag}"))
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

pub(super) fn scratch(label: &str) -> kroma_testing::TempDir {
    kroma_testing::temp_dir(&format!("defs-{label}"))
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

// Builds a `.tar.gz` laid out the way the upstream repo is; `layout` maps a
// path inside the archive to its contents.
pub(super) fn tarball(layout: &[(&str, &str)]) -> Vec<u8> {
    let root = scratch("tar");
    for (path, body) in layout {
        let full = root.path().join(path);
        std::fs::create_dir_all(full.parent().unwrap()).unwrap();
        std::fs::write(&full, body).unwrap();
    }
    let archive = root.path().join("out.tar.gz");
    let entries: Vec<String> = std::fs::read_dir(root.path())
        .unwrap()
        .filter_map(Result::ok)
        .map(|e| e.file_name().to_string_lossy().into_owned())
        .filter(|n| n != "out.tar.gz")
        .collect();
    let ok = Command::new("tar")
        .arg("-czf")
        .arg(&archive)
        .arg("-C")
        .arg(root.path())
        .args(&entries)
        .status()
        .unwrap();
    assert!(ok.success(), "could not build the fixture archive");
    std::fs::read(&archive).unwrap()
}

pub(super) fn serve(status: u16, body: Vec<u8>) -> String {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    std::thread::spawn(move || {
        for stream in listener.incoming() {
            let Ok(mut stream) = stream else { break };
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
    format!("http://127.0.0.1:{port}/master.tar.gz")
}

pub(super) struct TempStore {
    store: DefinitionStore,
    _dir: kroma_testing::TempDir,
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
        },
        _dir: dir,
    }
}
