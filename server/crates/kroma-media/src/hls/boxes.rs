use std::ops::Range;

#[derive(Clone, Copy)]
pub(super) struct Child {
    pub(super) kind: [u8; 4],
    pub(super) body: usize,
    end: usize,
}

impl Child {
    pub(super) fn inner(&self) -> Range<usize> {
        self.body..self.end
    }

    pub(super) fn version(&self, buf: &[u8]) -> u8 {
        buf.get(self.body).copied().unwrap_or(0)
    }
}

pub(super) struct Children<'a> {
    buf: &'a [u8],
    at: usize,
    end: usize,
}

pub(super) fn children(buf: &[u8], within: Range<usize>) -> Children<'_> {
    Children {
        buf,
        at: within.start,
        end: within.end.min(buf.len()),
    }
}

pub(super) fn top(buf: &[u8], kind: &[u8; 4]) -> Option<Child> {
    children(buf, 0..buf.len()).find(|child| &child.kind == kind)
}

pub(super) fn first(buf: &[u8], parent: &Child, kind: &[u8; 4]) -> Option<Child> {
    children(buf, parent.inner()).find(|child| &child.kind == kind)
}

impl Iterator for Children<'_> {
    type Item = Child;

    fn next(&mut self) -> Option<Child> {
        let at = self.at;
        let kind: [u8; 4] = self
            .buf
            .get(at.checked_add(4)?..at.checked_add(8)?)?
            .try_into()
            .ok()?;
        let (body, size) = match read_u32(self.buf, at)? {
            0 => (at + 8, self.end.checked_sub(at)?),
            1 => (at + 16, usize::try_from(read_u64(self.buf, at + 8)?).ok()?),
            declared => (at + 8, usize::try_from(declared).ok()?),
        };
        let end = at.checked_add(size)?;
        if end > self.end || body > end {
            return None;
        }
        self.at = end;
        Some(Child { kind, body, end })
    }
}

pub(super) fn read_u32(buf: &[u8], at: usize) -> Option<u32> {
    let bytes = buf.get(at..at.checked_add(4)?)?;
    Some(u32::from_be_bytes(bytes.try_into().ok()?))
}

pub(super) fn read_u64(buf: &[u8], at: usize) -> Option<u64> {
    let bytes = buf.get(at..at.checked_add(8)?)?;
    Some(u64::from_be_bytes(bytes.try_into().ok()?))
}

pub(super) fn read_time(buf: &[u8], at: usize, version: u8) -> Option<u64> {
    match version {
        1 => read_u64(buf, at),
        _ => read_u32(buf, at).map(u64::from),
    }
}

pub(super) fn write_time(buf: &mut [u8], at: usize, version: u8, value: u64) {
    let wide = value.to_be_bytes();
    let narrow = u32::try_from(value).unwrap_or(u32::MAX).to_be_bytes();
    let bytes: &[u8] = if version == 1 { &wide } else { &narrow };
    if let Some(field) = at
        .checked_add(bytes.len())
        .and_then(|end| buf.get_mut(at..end))
    {
        field.copy_from_slice(bytes);
    }
}
