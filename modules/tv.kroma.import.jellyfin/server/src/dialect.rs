//! Every call this importer makes, as one table. A server that speaks the same
//! API under other paths or another authorization scheme is another [`Dialect`].

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Method {
    Get,
    Post,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct Call {
    pub(crate) method: Method,
    pub(crate) path: &'static str,
}

impl Call {
    const fn get(path: &'static str) -> Self {
        Self {
            method: Method::Get,
            path,
        }
    }

    const fn post(path: &'static str) -> Self {
        Self {
            method: Method::Post,
            path,
        }
    }
}

pub(crate) struct Dialect {
    pub(crate) product: &'static str,
    pub(crate) local_address: &'static str,
    pub(crate) scheme: &'static str,
    pub(crate) server: Call,
    pub(crate) sign_in: Call,
    pub(crate) whoami: Call,
    pub(crate) users: Call,
    pub(crate) libraries: Call,
    pub(crate) items: Call,
    pub(crate) counts: Call,
}

pub(crate) const JELLYFIN: Dialect = Dialect {
    product: "Jellyfin Server",
    local_address: "http://127.0.0.1:8096",
    scheme: "MediaBrowser",
    server: Call::get("/System/Info/Public"),
    sign_in: Call::post("/Users/AuthenticateByName"),
    whoami: Call::get("/Users/Me"),
    users: Call::get("/Users"),
    libraries: Call::get("/Library/VirtualFolders"),
    items: Call::get("/Items"),
    counts: Call::get("/Items/Counts"),
};

#[cfg(test)]
impl Dialect {
    pub(crate) fn calls(&self) -> [Call; 7] {
        let Self {
            product: _,
            local_address: _,
            scheme: _,
            server,
            sign_in,
            whoami,
            users,
            libraries,
            items,
            counts,
        } = *self;
        [server, sign_in, whoami, users, libraries, items, counts]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_sign_in_is_the_only_call_that_is_not_a_read() {
        let writes: Vec<Call> = JELLYFIN
            .calls()
            .into_iter()
            .filter(|call| call.method != Method::Get)
            .collect();

        assert_eq!(writes, vec![JELLYFIN.sign_in]);
    }

    #[test]
    fn a_jellyfin_on_this_machine_is_looked_for_at_its_default_port() {
        let address = JELLYFIN.local_address;

        assert_eq!(address, "http://127.0.0.1:8096");
    }
}
