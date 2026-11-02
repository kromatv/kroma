use kroma_module_sdk::host::process::Child;

const READ_AT_ONCE: u32 = 64 * 1024;
const KEPT_BYTES: usize = 4 * 1024;
const REPORTED_LINES: usize = 3;

#[derive(Debug, Default)]
pub(crate) struct StderrTail {
    kept: Vec<u8>,
}

impl StderrTail {
    pub(crate) fn drain(&mut self, child: &Child) {
        loop {
            let more = child.read_stderr(READ_AT_ONCE);
            self.keep(&more);
            if more.len() < READ_AT_ONCE as usize {
                return;
            }
        }
    }

    fn keep(&mut self, more: &[u8]) {
        self.kept.extend_from_slice(more);
        let over = self.kept.len().saturating_sub(KEPT_BYTES);
        self.kept.drain(..over);
    }

    pub(crate) fn last_lines(&self) -> String {
        let text = String::from_utf8_lossy(&self.kept);
        let lines: Vec<&str> = text
            .lines()
            .map(str::trim)
            .filter(|line| !line.is_empty())
            .collect();
        lines[lines.len().saturating_sub(REPORTED_LINES)..].join(" | ")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_the_last_lines_are_reported() {
        let mut tail = StderrTail::default();

        tail.keep(b"first\nsecond\n\n  third  \nfourth\n");

        assert_eq!(tail.last_lines(), "second | third | fourth");
    }

    #[test]
    fn a_chatty_bridge_keeps_only_its_newest_bytes() {
        let mut tail = StderrTail::default();

        tail.keep(&[b'x'; KEPT_BYTES * 3]);
        tail.keep(b"\nbind: address already in use\n");

        assert_eq!(tail.kept.len(), KEPT_BYTES);
        assert!(tail.last_lines().ends_with("bind: address already in use"));
    }

    #[test]
    fn a_bridge_that_wrote_nothing_reports_nothing() {
        assert_eq!(StderrTail::default().last_lines(), "");
    }
}
