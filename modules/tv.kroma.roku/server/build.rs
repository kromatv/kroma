//! Packs `../channel/` (the BrightScript source tree) into the zip a Roku's
//! developer installer accepts, so the sidecar carries the channel it installs.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipWriter};

fn main() {
    let channel = Path::new(env!("CARGO_MANIFEST_DIR")).join("../channel");
    let out = PathBuf::from(std::env::var("OUT_DIR").unwrap()).join("channel.zip");
    let mut entries = Vec::new();
    collect(&channel, &channel, &mut entries);
    entries.sort();

    let mut zip = ZipWriter::new(fs::File::create(&out).unwrap());
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    for (name, path) in &entries {
        zip.start_file(name.as_str(), options).unwrap();
        zip.write_all(&fs::read(path).unwrap()).unwrap();
        println!("cargo:rerun-if-changed={}", path.display());
    }
    zip.finish().unwrap();
    println!("cargo:rerun-if-changed={}", channel.display());
}

fn collect(root: &Path, dir: &Path, into: &mut Vec<(String, PathBuf)>) {
    for entry in fs::read_dir(dir).unwrap() {
        let path = entry.unwrap().path();
        if path.is_dir() {
            collect(root, &path, into);
        } else if path.file_name().is_some_and(|n| n != ".DS_Store") {
            let name = path
                .strip_prefix(root)
                .unwrap()
                .to_string_lossy()
                .replace('\\', "/");
            into.push((name, path));
        }
    }
}
