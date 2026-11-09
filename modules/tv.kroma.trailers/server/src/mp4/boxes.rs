use std::fs::File;
use std::io::{Read, Seek, SeekFrom};

use anyhow::{anyhow, bail, Result};

pub(crate) type Kind = [u8; 4];

pub(crate) struct Reader<'a> {
    buf: &'a [u8],
    at: usize,
}

impl<'a> Reader<'a> {
    pub(crate) fn new(buf: &'a [u8]) -> Self {
        Self { buf, at: 0 }
    }

    pub(crate) fn take(&mut self, n: usize) -> Result<&'a [u8]> {
        let end = self
            .at
            .checked_add(n)
            .filter(|end| *end <= self.buf.len())
            .ok_or_else(|| anyhow!("a box ends before its fields do"))?;
        let out = &self.buf[self.at..end];
        self.at = end;
        Ok(out)
    }

    pub(crate) fn skip(&mut self, n: usize) -> Result<()> {
        self.take(n).map(|_| ())
    }

    pub(crate) fn u16(&mut self) -> Result<u16> {
        Ok(u16::from_be_bytes(self.array()?))
    }

    pub(crate) fn u32(&mut self) -> Result<u32> {
        Ok(u32::from_be_bytes(self.array()?))
    }

    pub(crate) fn i32(&mut self) -> Result<i32> {
        Ok(i32::from_be_bytes(self.array()?))
    }

    pub(crate) fn u64(&mut self) -> Result<u64> {
        Ok(u64::from_be_bytes(self.array()?))
    }

    pub(crate) fn i64(&mut self) -> Result<i64> {
        Ok(i64::from_be_bytes(self.array()?))
    }

    pub(crate) fn kind(&mut self) -> Result<Kind> {
        self.array()
    }

    fn array<const N: usize>(&mut self) -> Result<[u8; N]> {
        let bytes = self.take(N)?;
        let mut out = [0u8; N];
        out.copy_from_slice(bytes);
        Ok(out)
    }
}

pub(crate) struct Child<'a> {
    pub(crate) kind: Kind,
    pub(crate) body: &'a [u8],
    pub(crate) whole: &'a [u8],
}

impl Child<'_> {
    pub(crate) fn full(&self) -> Result<(u8, u32, Reader<'_>)> {
        let mut reader = Reader::new(self.body);
        let head = reader.u32()?;
        Ok(((head >> 24) as u8, head & 0x00ff_ffff, reader))
    }
}

pub(crate) fn children(buf: &[u8]) -> Result<Vec<Child<'_>>> {
    let mut out = Vec::new();
    let mut at = 0usize;
    while at < buf.len() {
        let mut reader = Reader::new(&buf[at..]);
        let small = reader.u32()?;
        let kind = reader.kind()?;
        let (size, header) = match small {
            0 => (buf.len() - at, 8),
            1 => {
                let large =
                    usize::try_from(reader.u64()?).map_err(|_| anyhow!("a box too large"))?;
                (large, 16)
            }
            n => (n as usize, 8),
        };
        if size < header || at + size > buf.len() {
            bail!("a {} box overruns its parent", printable(kind));
        }
        out.push(Child {
            kind,
            body: &buf[at + header..at + size],
            whole: &buf[at..at + size],
        });
        at += size;
    }
    Ok(out)
}

pub(crate) fn find<'a>(buf: &'a [u8], kind: &Kind) -> Result<Option<Child<'a>>> {
    Ok(children(buf)?.into_iter().find(|child| &child.kind == kind))
}

pub(crate) fn need<'a>(buf: &'a [u8], kind: &Kind) -> Result<Child<'a>> {
    find(buf, kind)?.ok_or_else(|| anyhow!("no {} box", printable(*kind)))
}

pub(crate) struct TopBox {
    pub(crate) kind: Kind,
    pub(crate) start: u64,
    pub(crate) header: u64,
    pub(crate) size: u64,
}

pub(crate) fn top_level(file: &mut File) -> Result<Vec<TopBox>> {
    let end = file.seek(SeekFrom::End(0))?;
    let mut out = Vec::new();
    let mut at = 0u64;
    while at + 8 <= end {
        file.seek(SeekFrom::Start(at))?;
        let mut head = [0u8; 8];
        file.read_exact(&mut head)?;
        let mut reader = Reader::new(&head);
        let small = reader.u32()?;
        let kind = reader.kind()?;
        let (size, header) = match small {
            0 => (end - at, 8),
            1 => {
                let mut large = [0u8; 8];
                file.read_exact(&mut large)?;
                (u64::from_be_bytes(large), 16)
            }
            n => (u64::from(n), 8),
        };
        if size < header || at + size > end {
            bail!(
                "the {} box at {at} runs past the end of the file",
                printable(kind)
            );
        }
        out.push(TopBox {
            kind,
            start: at,
            header,
            size,
        });
        at += size;
    }
    Ok(out)
}

pub(crate) fn read_box(file: &mut File, top: &TopBox, limit: u64) -> Result<Vec<u8>> {
    if top.size > limit {
        bail!(
            "a {} box of {} bytes is larger than this remuxer reads",
            printable(top.kind),
            top.size
        );
    }
    file.seek(SeekFrom::Start(top.start + top.header))?;
    let mut body = vec![0u8; (top.size - top.header) as usize];
    file.read_exact(&mut body)?;
    Ok(body)
}

pub(crate) fn printable(kind: Kind) -> String {
    kind.iter()
        .map(|b| {
            if b.is_ascii_graphic() {
                *b as char
            } else {
                '?'
            }
        })
        .collect()
}

#[derive(Default)]
pub(crate) struct Body(pub(crate) Vec<u8>);

impl Body {
    pub(crate) fn u16(&mut self, v: u16) -> &mut Self {
        self.0.extend_from_slice(&v.to_be_bytes());
        self
    }

    pub(crate) fn u32(&mut self, v: u32) -> &mut Self {
        self.0.extend_from_slice(&v.to_be_bytes());
        self
    }

    pub(crate) fn i32(&mut self, v: i32) -> &mut Self {
        self.0.extend_from_slice(&v.to_be_bytes());
        self
    }

    pub(crate) fn u64(&mut self, v: u64) -> &mut Self {
        self.0.extend_from_slice(&v.to_be_bytes());
        self
    }

    pub(crate) fn i64(&mut self, v: i64) -> &mut Self {
        self.0.extend_from_slice(&v.to_be_bytes());
        self
    }

    pub(crate) fn zeros(&mut self, n: usize) -> &mut Self {
        self.0.resize(self.0.len() + n, 0);
        self
    }

    pub(crate) fn bytes(&mut self, v: &[u8]) -> &mut Self {
        self.0.extend_from_slice(v);
        self
    }
}

pub(crate) fn boxed(kind: &Kind, parts: &[&[u8]]) -> Vec<u8> {
    let len = 8 + parts.iter().map(|p| p.len()).sum::<usize>();
    let mut out = Vec::with_capacity(len);
    out.extend_from_slice(&(len as u32).to_be_bytes());
    out.extend_from_slice(kind);
    for part in parts {
        out.extend_from_slice(part);
    }
    out
}

pub(crate) fn full_box(kind: &Kind, version: u8, flags: u32, body: &[u8]) -> Vec<u8> {
    let head = ((u32::from(version) << 24) | (flags & 0x00ff_ffff)).to_be_bytes();
    boxed(kind, &[&head, body])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn children_walks_siblings_and_keeps_each_box_whole() {
        let buf = [boxed(b"free", &[&[1, 2]]), boxed(b"skip", &[])].concat();

        let found = children(&buf).unwrap();

        assert_eq!(found.len(), 2);
        assert_eq!(&found[0].kind, b"free");
        assert_eq!(found[0].body, &[1, 2]);
        assert_eq!(found[1].whole, boxed(b"skip", &[]).as_slice());
    }

    #[test]
    fn a_box_claiming_more_than_its_parent_holds_is_refused() {
        let mut buf = boxed(b"free", &[&[0; 4]]);
        buf[3] = 200;

        let refused = children(&buf);

        assert!(refused.is_err());
    }

    #[test]
    fn a_reader_refuses_to_read_past_the_end() {
        let mut reader = Reader::new(&[0, 1, 2]);

        let read = reader.u32();

        assert!(read.is_err());
    }
}
