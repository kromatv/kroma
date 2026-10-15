/// Where a response body reports the bytes it handed the socket. Implemented by
/// whoever is counting; [`Unmetered`] is the answer for a stream that should not
/// count at all.
pub trait ByteMeter: Clone + Send + Unpin + 'static {
    fn add(&self, bytes: u64);
}

#[derive(Clone, Copy, Debug, Default)]
pub struct Unmetered;

impl ByteMeter for Unmetered {
    fn add(&self, _bytes: u64) {}
}
